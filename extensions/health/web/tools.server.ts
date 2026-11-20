/**
 * Tools for the AI (spec 005 of the core), as `health__<tool>` on the assistant's MCP server. Claude joins
 * them with other apps' tools (e.g. it reads a training plan and sends its sessions with send_workout).
 * The shell already gives `describe` and read-only `query` over the health schema. Writes to Garmin and
 * Strava are queued (health.outbox) and run by the connectors service within seconds; `writes` says how
 * each one ended.
 */
import { todayIn, ToolError, type ExtTool, type ExtensionContext } from '$shell';
import { stepProblems, WORKOUT_SPORTS, writeLine } from './lib/connectors';
import {
  linkedActivities,
  providerInfo,
  pushedWorkouts,
  queueWrite,
  requestSync,
  setOption,
  stravaOf,
  weights,
  writes
} from './lib/connectors.server';
import { activityById } from './lib/activity.server';
import { AI_STREAMS, aiLaps, aiSamples, aiSummary, extrasOf, hrZones } from './lib/activity';
import { latestReadings, recentActivities, recentSeries } from './lib/health.server';
import { METRICS } from './lib/metrics';

const BY = 'tool';
const queued = (ctx: ExtensionContext, ids: { id: string; target: string; op: string }[]) => ({
  queued: ids,
  note: ctx.t('Queued: the service runs it within a few seconds. Call writes with these ids to see how it ended.')
});
const opt = (v: unknown, max: number) => (v === undefined || v === null ? undefined : String(v).slice(0, max));

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const scale = (v: unknown, name: string, max: number): number | null => {
  if (v === undefined || v === null) return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0 || n > max) throw new Error(`${name} must be an integer 0-${max}`);
  return n;
};

export const tools: ExtTool[] = [
  {
    name: 'overview',
    title: 'Training overview',
    readOnly: true,
    description:
      'Garmin overview for a profile: the latest reading of every daily metric (sleep, HRV, body battery, ' +
      'stress, resting HR, steps, training readiness, ...), the daily series of the last `days` days ' +
      '(default 14, max 90) and the most recent activities (default 20). Values are already extracted from Garmin JSON.',
    input: {
      type: 'object',
      properties: { days: { type: 'integer', minimum: 1, maximum: 90 }, activities: { type: 'integer', minimum: 0, maximum: 200 } }
    },
    run: (args, ctx) =>
      ctx.db(async (sql) => {
        const days = Math.min(90, Math.max(1, Number(args.days) || 14));
        const limit = Math.min(200, Math.max(0, Number(args.activities ?? 20)));
        const [latest, series, activities] = await Promise.all([
          latestReadings(sql, ctx.dataProfileId!),
          recentSeries(sql, ctx.dataProfileId!, METRICS.map((m) => m.key), days),
          limit ? recentActivities(sql, ctx.dataProfileId!, limit) : Promise.resolve([])
        ]);
        const [strava, withings, weight, onGarmin] = await Promise.all([
          providerInfo(sql, ctx.dataProfileId!, 'strava'),
          providerInfo(sql, ctx.dataProfileId!, 'withings'),
          weights(sql, ctx.dataProfileId!, days),
          pushedWorkouts(sql, ctx.dataProfileId!)
        ]);
        return { profile: ctx.dataProfileId, latest, series, activities, sources: { strava, withings }, weight, workouts_on_garmin: onGarmin };
      })
  },
  {
    name: 'add_journal_entry',
    title: 'Save how a day felt',
    readOnly: false,
    destructive: true,
    description:
      'Save how a day (or one activity) felt: rpe 0-10, soreness 0-10, mood 0-10, note, illness, injury. ' +
      'One entry per profile, day and activity: saving again updates it.',
    input: {
      type: 'object',
      properties: {
        day: { type: 'string', description: 'YYYY-MM-DD' },
        activity_id: { type: 'string' },
        rpe: { type: 'integer' },
        soreness: { type: 'integer' },
        mood: { type: 'integer' },
        note: { type: 'string' },
        illness: { type: 'boolean' },
        injury: { type: 'boolean' }
      },
      required: ['day']
    },
    run: (args, ctx) => {
      const day = String(args.day ?? '');
      if (!DAY.test(day)) throw new Error('day must be YYYY-MM-DD');
      const row = {
        activity_id: args.activity_id ? String(args.activity_id) : null,
        rpe: scale(args.rpe, 'rpe', 10),
        soreness: scale(args.soreness, 'soreness', 10),
        mood: scale(args.mood, 'mood', 10),
        note: args.note ? String(args.note).slice(0, 4000) : null,
        illness: args.illness === true,
        injury: args.injury === true
      };
      return ctx.db(async (sql) => {
        const [saved] = await sql`
          INSERT INTO health.journal_entries (id, profile_id, day, activity_id, rpe, soreness, mood, note, illness, injury)
          VALUES (${crypto.randomUUID()}, ${ctx.dataProfileId!}, ${day}, ${row.activity_id}, ${row.rpe}, ${row.soreness},
                  ${row.mood}, ${row.note}, ${row.illness}, ${row.injury})
          ON CONFLICT (profile_id, day, activity_id)
          DO UPDATE SET rpe = EXCLUDED.rpe, soreness = EXCLUDED.soreness, mood = EXCLUDED.mood, note = EXCLUDED.note,
                        illness = EXCLUDED.illness, injury = EXCLUDED.injury, updated_at = now()
          RETURNING id, day::text AS day`;
        return { saved };
      });
    }
  },
  {
    name: 'activities',
    title: 'Activities with their Strava twins',
    readOnly: true,
    description:
      'Activities between `from` and `to` (YYYY-MM-DD, default the last 14 days), newest first, at most `limit` ' +
      '(default 50, max 200): Garmin id, sport, name, description, start, distance, duration and the Strava ' +
      'activity of the same workout ({id, name, description}) when Strava is connected, avg and max heart rate ' +
      '(bpm) and training load. Strava-only activities have activity_id null. Use the ids with edit_activity, ' +
      'and with activity for heart rate over time, cadence, grade, laps and running dynamics.',
    input: {
      type: 'object',
      properties: {
        from: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
        to: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
        limit: { type: 'integer', minimum: 1, maximum: 200 }
      }
    },
    run: (args, ctx) => {
      const to = String(args.to ?? todayIn());
      const from = String(args.from ?? new Date(Date.parse(`${to}T12:00:00Z`) - 13 * 86_400_000).toISOString().slice(0, 10));
      return ctx.db((sql) => linkedActivities(sql, ctx.dataProfileId!, from, to, Number(args.limit ?? 50)));
    }
  },
  {
    name: 'activity',
    title: 'One activity in detail',
    readOnly: true,
    description:
      'One activity (Garmin `activity_id` from overview or activities) in detail: the summary (avg/max heart ' +
      'rate, distance, durations, power, load), every number of Garmin\'s own summary under `garmin` (field ' +
      'names as Garmin sends them, e.g. maxHR, hrTimeInZone_1..5, averageRunningCadenceInStepsPerMinute, ' +
      'avgStrideLength, avgGroundContactTime, avgVerticalOscillation, aerobicTrainingEffect, vO2MaxValue), ' +
      'seconds per heart-rate zone, laps and Garmin\'s splits (avgHr, maxHr, pace as avgSpeedMps, cadence, ' +
      'stride, ground contact, ...), the RPE/note saved for it, and its recorded streams averaged over at most ' +
      '`points` equal stretches (default 120, max 1000): time_s (start of each stretch, seconds from the ' +
      'start), heartRate (bpm), pace_s_per_km (runs, walks, hikes), speed_mps, cadence (as the watch records ' +
      'it: for runs often steps of one foot per minute, double it for steps per minute), grade (%), elevation ' +
      '(m), power (W), temperature, respirationRate, strideLength, groundContactTime, verticalOscillation, ' +
      'verticalRatio, stamina, ... Only the streams the watch recorded are there; `streams` limits which.',
    input: {
      type: 'object',
      properties: {
        activity_id: { type: 'string', maxLength: 40 },
        points: { type: 'integer', minimum: 10, maximum: 1000 },
        streams: { type: 'array', items: { type: 'string', enum: [...AI_STREAMS] }, maxItems: AI_STREAMS.length }
      },
      required: ['activity_id']
    },
    run: async (args, ctx) => {
      const id = String(args.activity_id ?? '');
      if (!/^[0-9A-Za-z_-]{1,40}$/.test(id)) throw new ToolError('activity_id must be a Garmin activity id');
      const d = await ctx.db((sql) => activityById(sql, ctx.dataProfileId!, id));
      if (!d.activity) throw new ToolError(`No activity ${id} for this profile`);
      const { raw, has_gps, ...summary } = d.activity;
      const only = Array.isArray(args.streams) && args.streams.length ? args.streams.map(String) : undefined;
      const streams = d.streams as Record<string, unknown> | null;
      return {
        activity: { ...summary, description: typeof raw?.description === 'string' ? raw.description : null },
        extras: extrasOf(raw),
        hr_zones_s: hrZones(raw),
        garmin: aiSummary(raw),
        laps: aiLaps(streams?.laps),
        splits: aiLaps(streams?.typedSplits),
        journal: d.journal,
        ...aiSamples(streams, summary.sport, Number(args.points) || 120, only),
        ...(streams ? {} : { note: 'No streams synced for this activity yet (or the watch recorded none).' })
      };
    }
  },
  {
    name: 'edit_activity',
    title: 'Rename or describe an activity on Strava and Garmin',
    readOnly: false,
    destructive: true,
    description:
      'Set the title and/or description of an activity on Strava and/or Garmin Connect, e.g. the name of the ' +
      'planned session ("5x100 m strides"). Give the Garmin `activity_id` (its Strava twin is found by itself) ' +
      'or a `strava_id`. `on` limits where (default: everywhere the activity is). Fields left out stay as they are; ' +
      'an empty description clears it. Queued; returns the write ids.',
    input: {
      type: 'object',
      properties: {
        activity_id: { type: 'string', maxLength: 40 },
        strava_id: { type: 'string', maxLength: 40 },
        title: { type: 'string', maxLength: 255 },
        description: { type: 'string', maxLength: 4000 },
        on: { type: 'array', items: { type: 'string', enum: ['garmin', 'strava'] } }
      }
    },
    run: (args, ctx) =>
      ctx.db(async (sql) => {
        const p = ctx.dataProfileId!;
        const title = opt(args.title, 255);
        const description = opt(args.description, 4000);
        if (title === undefined && description === undefined) throw new ToolError('Give a title, a description or both.');
        if (title !== undefined && !title.trim()) throw new ToolError('The title cannot be empty.');
        const on = new Set<string>(Array.isArray(args.on) && args.on.length ? (args.on as string[]) : ['garmin', 'strava']);
        const garminId = args.activity_id ? String(args.activity_id) : null;
        const stravaId = args.strava_id ? String(args.strava_id) : garminId ? await stravaOf(sql, p, garminId) : null;
        if (!garminId && !stravaId) throw new ToolError('Give activity_id (Garmin) or strava_id.');
        const fields = { ...(title !== undefined ? { title } : {}), ...(description !== undefined ? { description } : {}) };
        const ids: { id: string; target: string; op: string }[] = [];
        if (garminId && on.has('garmin')) ids.push({ id: await queueWrite(sql, p, 'garmin', 'edit_activity', { activity_id: garminId, ...fields }, BY), target: 'garmin', op: 'edit_activity' });
        if (stravaId && on.has('strava')) ids.push({ id: await queueWrite(sql, p, 'strava', 'edit_activity', { strava_id: stravaId, ...fields }, BY), target: 'strava', op: 'edit_activity' });
        if (!ids.length) throw new ToolError(on.has('strava') ? 'This activity has no Strava twin (yet): is Strava connected and synced?' : 'Nothing to change where asked.');
        return queued(ctx, ids);
      })
  },
  {
    name: 'send_workout',
    title: 'Put a structured workout on the Garmin watch',
    readOnly: false,
    destructive: true,
    description:
      'Create a structured workout in Garmin Connect and schedule it on `day`, so it syncs to the watch. `ref` is ' +
      'your own stable id (e.g. "training:<session id>"): sending the same ref again replaces the old workout, ' +
      'remove_workout takes it off. sport: ' + WORKOUT_SPORTS.join(', ') + '. steps: [{kind: warmup|work|recovery|rest|cooldown, ' +
      'durationType: time (s)|distance (m)|calories|lap, durationValue, target?: {type: pace (low/high in s_per_km)|' +
      'speed (m_s or kph)|hr (bpm)|power (W)|cadence, low, high, unit}, note?} or {kind: repeat, repeats, steps: [...]}], ' +
      'one level of repeat. For strength, one step per exercise (kind work, durationType lap, note "Squat 3x8 @ 60 kg"). Queued.',
    input: {
      type: 'object',
      properties: {
        ref: { type: 'string', minLength: 1, maxLength: 120 },
        sport: { type: 'string', enum: WORKOUT_SPORTS },
        title: { type: 'string', minLength: 1, maxLength: 80 },
        day: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
        note: { type: 'string', maxLength: 1000 },
        steps: { type: 'array', minItems: 1, maxItems: 50, items: { type: 'object' } }
      },
      required: ['ref', 'sport', 'title', 'day', 'steps']
    },
    run: (args, ctx) => {
      const problems = stepProblems(args.steps);
      if (problems.length) throw new ToolError(problems.slice(0, 8).join('; '));
      return ctx.db(async (sql) => {
        const payload = { ref: String(args.ref), sport: String(args.sport), title: String(args.title).trim(), day: String(args.day), steps: args.steps, ...(args.note ? { note: String(args.note) } : {}) };
        return queued(ctx, [{ id: await queueWrite(sql, ctx.dataProfileId!, 'garmin', 'send_workout', payload, BY), target: 'garmin', op: 'send_workout' }]);
      });
    }
  },
  {
    name: 'remove_workout',
    title: 'Take a workout off the Garmin watch',
    readOnly: false,
    destructive: true,
    description: 'Delete the Garmin workout that send_workout made for `ref` (and its place on the Garmin calendar). Queued.',
    input: { type: 'object', properties: { ref: { type: 'string', minLength: 1, maxLength: 120 } }, required: ['ref'] },
    run: (args, ctx) =>
      ctx.db(async (sql) => queued(ctx, [{ id: await queueWrite(sql, ctx.dataProfileId!, 'garmin', 'remove_workout', { ref: String(args.ref) }, BY), target: 'garmin', op: 'remove_workout' }]))
  },
  {
    name: 'add_weight',
    title: 'Add a weigh-in to Garmin',
    readOnly: false,
    description: 'Add a weigh-in (kg, 20-400) to Garmin Connect at `at` (ISO time, default now). It comes back with the next Garmin sync. Queued.',
    input: {
      type: 'object',
      properties: { kg: { type: 'number', minimum: 20, maximum: 400 }, at: { type: 'string', maxLength: 40 } },
      required: ['kg']
    },
    run: (args, ctx) => {
      const at = args.at ? new Date(String(args.at)) : new Date();
      if (Number.isNaN(at.getTime())) throw new ToolError('at must be an ISO time, e.g. 2026-11-15T07:30:00+01:00');
      return ctx.db(async (sql) => queued(ctx, [{ id: await queueWrite(sql, ctx.dataProfileId!, 'garmin', 'add_weight', { kg: Number(args.kg), at: at.toISOString() }, BY), target: 'garmin', op: 'add_weight' }]));
    }
  },
  {
    name: 'copy_weights_to_garmin',
    title: 'Copy Withings weigh-ins to Garmin',
    readOnly: false,
    description:
      'Copy the Withings weigh-ins from `since` (YYYY-MM-DD) to `until` (default today) to Garmin Connect, ' +
      'skipping days Garmin already has (within 0.05 kg). At most 400. Queued, one write each.',
    input: {
      type: 'object',
      properties: { since: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' }, until: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' } },
      required: ['since']
    },
    run: (args, ctx) =>
      ctx.db(async (sql) => {
        const p = ctx.dataProfileId!;
        const rows = await sql`
          SELECT w.day, w.weight_kg::float8 AS kg, w.raw->>'at' AS at FROM health.synced_weight w
           WHERE w.profile_id = ${p} AND w.source = 'withings' AND w.day BETWEEN ${String(args.since)}::date AND ${String(args.until ?? todayIn())}::date
             AND NOT EXISTS (SELECT 1 FROM health.synced_weight g WHERE g.profile_id = w.profile_id AND g.source = 'garmin'
                               AND g.day = w.day AND abs(g.weight_kg - w.weight_kg) < 0.05)
           ORDER BY w.day LIMIT 400`;
        const ids = [];
        for (const r of rows) {
          const at = r.at ?? `${r.day instanceof Date ? r.day.toISOString().slice(0, 10) : r.day}T07:00:00Z`;
          ids.push({ id: await queueWrite(sql, p, 'garmin', 'add_weight', { kg: Number(r.kg), at, from: 'withings' }, BY), target: 'garmin', op: 'add_weight' });
        }
        return ids.length ? queued(ctx, ids) : { queued: [], note: ctx.t('Garmin already has every Withings weigh-in in that range.') };
      })
  },
  {
    name: 'configure',
    title: 'Switch connector options',
    readOnly: false,
    description: 'withings_to_garmin: true copies every NEW Withings weigh-in to Garmin Connect from now on (older ones: copy_weights_to_garmin); false stops it.',
    input: { type: 'object', properties: { withings_to_garmin: { type: 'boolean' } }, required: ['withings_to_garmin'] },
    run: (args, ctx) =>
      ctx.db(async (sql) => {
        await setOption(sql, ctx.dataProfileId!, 'withings_to_garmin', { on: args.withings_to_garmin === true, since: new Date().toISOString() });
        return { withings_to_garmin: args.withings_to_garmin === true };
      })
  },
  {
    name: 'sync_now',
    title: 'Sync a source now',
    readOnly: false,
    description: 'Ask for a sync of garmin, strava or withings now instead of waiting for the next one (every 30 minutes).',
    input: { type: 'object', properties: { source: { type: 'string', enum: ['garmin', 'strava', 'withings'] } }, required: ['source'] },
    run: (args, ctx) =>
      ctx.db(async (sql) => {
        await requestSync(sql, ctx.dataProfileId!, String(args.source));
        return { requested: args.source, note: ctx.t('Sync queued: it starts within a few seconds.') };
      })
  },
  {
    name: 'writes',
    title: 'How the writes to Garmin and Strava ended',
    readOnly: true,
    description:
      'The writes queued by edit_activity, send_workout, remove_workout and the weight tools: state (queued, running, ' +
      'done, failed, unsupported), error and result. Give `ids` from a queued answer, or get the last `limit` (default 20).',
    input: {
      type: 'object',
      properties: { ids: { type: 'array', items: { type: 'string', maxLength: 40 }, maxItems: 100 }, limit: { type: 'integer', minimum: 1, maximum: 100 } }
    },
    run: (args, ctx) =>
      ctx.db(async (sql) => {
        const list = await writes(sql, ctx.dataProfileId!, { ids: args.ids as string[] | undefined, limit: args.limit as number | undefined });
        return list.map((w) => ({ ...w, summary: writeLine(w, ctx.t) }));
      })
  }
];
