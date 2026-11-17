/**
 * Tools for the AI (spec 005 of the core), as `training__<tool>`: full control over plans (one active),
 * workouts made of items, templates and the library. Claude joins them with other apps: it puts a workout
 * on the Garmin watch with health__send_workout (garmin_workout gives the exact arguments, mark_sent
 * records it), and names the real activity on Strava with health__edit_activity, then links it here with
 * log_session.
 */
import { todayIn, ToolError, type ExtTool, type ExtensionContext } from '$shell';
import { isPhoto, searchPhotos } from './lib/photos';
import { keepPhoto } from './lib/photos.server';
import {
  customLibrary,
  deleteCustomEntry,
  deletePlan,
  deleteSessions,
  deleteTemplate,
  doneWorkouts,
  fullLibrary,
  insertPlan,
  insertSession,
  logSession,
  moveSessions,
  planExists,
  plans,
  saveCustomEntry,
  saveTemplate,
  sessionById,
  sessionsIn,
  setActivePlan,
  setSent,
  templateById,
  templates,
  touchTemplate,
  updatePlan,
  updateSession
} from './lib/db.server';
import { GROUPS, MUSCLES, searchLibrary } from './lib/library';
import { addDays, bests, cleanItems, garminWorkout, isDay, sessionProblems, SPORTS, STATUSES, UNITS, type Item, type SessionInput, type SessionResult, type Status } from './lib/model';

const DAY = { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' };
const ITEMS = {
  type: 'array',
  maxItems: 40,
  description:
    'The workout, in order. Cardio: {kind: "cardio", sport (running, cycling, swimming, walking, hiking, rowing, skiing, other), name?, ' +
    'duration_min?, distance_m?, steps? (blocks for the watch: [{kind: warmup|work|recovery|rest|cooldown, durationType: time (s)|distance (m)|lap, ' +
    'durationValue, target?: {type: pace (low/high s_per_km)|hr (bpm)|power|cadence, low, high}, note?} or {kind: repeat, repeats, steps: [...]}]), ' +
    'note?, done?}. Exercise: {kind: "exercise", ref? (library id, see exercises), name, unit: reps|seconds|minutes, ' +
    'sets: [{reps?, kg?, seconds? (also for minutes: 12 min = 720), done?}], rest_s?, note?}. ' +
    'E.g. 30 min run + full body + 15 min sauna is one workout of three or more items.',
  items: { type: 'object' }
};
const SESSION_PROPS = {
  plan_id: { type: ['string', 'null'], maxLength: 40 },
  day: DAY,
  time_local: { type: ['string', 'null'], description: 'HH:MM, or null for any time of the day' },
  title: { type: 'string', maxLength: 120, description: 'Left out: made from the items ("Run + Strength (5) + Sauna").' },
  description: { type: ['string', 'null'], maxLength: 4000 },
  duration_min: { type: ['integer', 'null'], minimum: 1, maximum: 1440, description: 'The planned total, if it is not the sum of the items.' },
  items: { ...ITEMS, type: ['array', 'null'] }
};
const PLAN_PROPS = {
  name: { type: 'string', minLength: 1, maxLength: 120 },
  goal: { type: ['string', 'null'], maxLength: 1000 },
  sport: { type: ['string', 'null'], enum: [...SPORTS, null], description: 'Main discipline; null for a mixed plan' },
  start_day: { type: ['string', 'null'] },
  end_day: { type: ['string', 'null'] },
  notes: { type: ['string', 'null'], maxLength: 4000 }
};

const p = (ctx: ExtensionContext) => ctx.dataProfileId!;
const fail = (problems: string[]) => {
  if (problems.length) throw new ToolError(problems.slice(0, 8).join('; '));
};
type Tx = Parameters<Parameters<ExtensionContext['db']>[0]>[0];

async function checkPlan(sql: Tx, profile: string, planId: unknown) {
  if (planId && !(await planExists(sql, profile, String(planId)))) throw new ToolError(`No plan ${planId}: create_plan first, or leave plan_id out.`);
}
function checkDays(a: Record<string, unknown>) {
  for (const k of ['start_day', 'end_day']) if (a[k] != null && a[k] !== '' && !isDay(a[k])) throw new ToolError(`${k}: YYYY-MM-DD or null`);
  if (a.start_day && a.end_day && String(a.end_day) < String(a.start_day)) throw new ToolError('end_day is before start_day.');
}

function asResult(v: unknown): SessionResult | null {
  if (!v || typeof v !== 'object') return null;
  const r = v as Record<string, unknown>;
  const out: SessionResult = {};
  const rpe = Number(r.rpe);
  if (r.rpe !== undefined && Number.isInteger(rpe) && rpe >= 0 && rpe <= 10) out.rpe = rpe;
  if (typeof r.note === 'string' && r.note.trim()) out.note = r.note.trim().slice(0, 2000);
  for (const k of ['started_at', 'finished_at'] as const) if (typeof r[k] === 'string' && !Number.isNaN(Date.parse(r[k] as string))) out[k] = new Date(r[k] as string).toISOString();
  return Object.keys(out).length ? out : null;
}

export const tools: ExtTool[] = [
  {
    name: 'overview',
    title: 'Training overview',
    readOnly: true,
    description:
      'The training of a profile: the active plan (one at a time; the week, calendar and tile show its workouts and those of no plan), ' +
      'every plan with its state (active, waiting, finished) and counts, every workout from `from` to `to` (YYYY-MM-DD, default ' +
      'last 7 days to 21 days ahead) with its items, status planned/done/skipped, result and whether it is on the watch, the ' +
      'templates, and the best set of each exercise. Start here.',
    input: { type: 'object', properties: { from: DAY, to: DAY } },
    run: (args, ctx) =>
      ctx.db(async (sql) => {
        const today = todayIn();
        const from = String(args.from ?? addDays(today, -7));
        const to = String(args.to ?? addDays(today, 21));
        const [pl, sessions, tpl, done] = await Promise.all([plans(sql, p(ctx)), sessionsIn(sql, p(ctx), from, to), templates(sql, p(ctx)), doneWorkouts(sql, p(ctx))]);
        return { today, from, to, active_plan: pl.find((x) => x.active) ?? null, plans: pl, sessions, templates: tpl, strength_bests: bests(done) };
      })
  },
  {
    name: 'list_sessions',
    title: 'List workouts',
    readOnly: true,
    description: 'Workouts from `from` to `to` (YYYY-MM-DD, at most 400 days), optionally of one plan or status. At most 500.',
    input: { type: 'object', properties: { from: DAY, to: DAY, plan_id: { type: 'string' }, status: { type: 'string', enum: [...STATUSES] } }, required: ['from', 'to'] },
    run: (args, ctx) => {
      const from = String(args.from);
      const to = String(args.to);
      if (to < from || Date.parse(to) - Date.parse(from) > 400 * 86_400_000) throw new ToolError('to must be after from, at most 400 days later.');
      return ctx.db((sql) => sessionsIn(sql, p(ctx), from, to, { planId: args.plan_id as string | undefined, status: args.status as string | undefined }));
    }
  },
  {
    name: 'get_session',
    title: 'One workout',
    readOnly: true,
    description: 'Everything about one workout: plan, items (with sets and blocks), status, logged result, linked activity, on the watch.',
    input: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    run: (args, ctx) =>
      ctx.db(async (sql) => {
        const s = await sessionById(sql, p(ctx), String(args.id));
        if (!s) throw new ToolError(`No workout ${args.id}.`);
        return s;
      })
  },
  {
    name: 'create_plan',
    title: 'Create a training plan',
    readOnly: false,
    description:
      'A plan: a goal over some days ("Half marathon under 1:45", 12 weeks). sport is its main discipline, null for a mixed plan. ' +
      'active true makes it the one active plan (the one before waits). Then add its workouts with add_sessions and plan_id. Returns the plan id.',
    input: { type: 'object', properties: { ...PLAN_PROPS, active: { type: 'boolean' } }, required: ['name'] },
    run: (args, ctx) =>
      ctx.db(async (sql) => {
        checkDays(args);
        if (args.sport && !SPORTS.includes(args.sport as never)) throw new ToolError(`sport: one of ${SPORTS.join(', ')}`);
        const id = await insertPlan(sql, p(ctx), { ...(args as Record<string, string>), name: String(args.name) }, args.active === true);
        return { id, active: args.active === true };
      })
  },
  {
    name: 'update_plan',
    title: 'Change a training plan',
    readOnly: false,
    destructive: true,
    description:
      'Change the given fields of a plan. status done or archived finishes it (it stops being active; its workouts stay); active true ' +
      'makes it the one active plan, false sets it aside.',
    input: {
      type: 'object',
      properties: { id: { type: 'string' }, ...PLAN_PROPS, status: { type: 'string', enum: ['active', 'done', 'archived'] }, active: { type: 'boolean' } },
      required: ['id']
    },
    run: (args, ctx) =>
      ctx.db(async (sql) => {
        checkDays(args);
        const id = String(args.id);
        if (!(await updatePlan(sql, p(ctx), id, args as Record<string, string>))) throw new ToolError(`No plan ${id}.`);
        if (args.active === true) await setActivePlan(sql, p(ctx), id);
        if (args.active === false) await sql`UPDATE training.plans SET active = false WHERE profile_id = ${p(ctx)} AND id = ${id}`;
        return { updated: id };
      })
  },
  {
    name: 'set_active_plan',
    title: 'Choose the active plan',
    readOnly: false,
    description: 'Make a plan the one active plan (id), or have none (id null). Only its workouts and those of no plan show in the week, the calendar and the tile.',
    input: { type: 'object', properties: { id: { type: ['string', 'null'] } }, required: ['id'] },
    run: (args, ctx) =>
      ctx.db(async (sql) => {
        const id = args.id ? String(args.id) : null;
        if (!(await setActivePlan(sql, p(ctx), id))) throw new ToolError(`No plan ${id}.`);
        return { active_plan: id };
      })
  },
  {
    name: 'delete_plan',
    title: 'Delete a training plan',
    readOnly: false,
    destructive: true,
    description:
      'Delete a plan. Its workouts stay as workouts of no plan, unless with_sessions is true: then those still planned go too (done ' +
      'ones are history and stay). If any were on the watch, take them off with health__remove_workout (ref "training:<id>").',
    input: { type: 'object', properties: { id: { type: 'string' }, with_sessions: { type: 'boolean' } }, required: ['id'] },
    run: (args, ctx) =>
      ctx.db(async (sql) => {
        const removed = await deletePlan(sql, p(ctx), String(args.id), args.with_sessions === true);
        if (!removed) throw new ToolError(`No plan ${args.id}.`);
        return { deleted: args.id, sessions_deleted: removed };
      })
  },
  {
    name: 'add_sessions',
    title: 'Add workouts',
    readOnly: false,
    description:
      'Add up to 100 workouts at once, e.g. a whole plan; any number on one day. Each: day and items (or at least a title), plan_id, ' +
      'time_local, title, description, duration_min. A workout can start from a template: template_id fills title, description and ' +
      'items unless given. Exercises: use library ids as ref (tool exercises). Returns the new ids in order.',
    input: {
      type: 'object',
      properties: {
        sessions: { type: 'array', minItems: 1, maxItems: 100, items: { type: 'object', properties: { ...SESSION_PROPS, template_id: { type: 'string' } } } }
      },
      required: ['sessions']
    },
    run: (args, ctx) =>
      ctx.db(async (sql) => {
        const list = args.sessions as (SessionInput & { template_id?: string })[];
        const ready: SessionInput[] = [];
        const problems: string[] = [];
        for (const [i, raw] of list.entries()) {
          let s: SessionInput = raw;
          if (raw.template_id) {
            const tpl = await templateById(sql, p(ctx), raw.template_id);
            if (!tpl) {
              problems.push(`sessions[${i}].template_id: no template ${raw.template_id}`);
              continue;
            }
            s = { title: tpl.name, description: tpl.description, items: tpl.items, ...raw };
            await touchTemplate(sql, p(ctx), tpl.id);
          }
          problems.push(...sessionProblems(s, true).map((x) => `sessions[${i}].${x}`));
          await checkPlan(sql, p(ctx), s.plan_id);
          ready.push(s);
        }
        fail(problems);
        const ids = [];
        for (const s of ready) ids.push(await insertSession(sql, p(ctx), { ...s, status: 'planned' }, { source: 'claude' }));
        return { ids };
      })
  },
  {
    name: 'update_session',
    title: 'Change a workout',
    readOnly: false,
    destructive: true,
    description:
      'Change the given fields of a workout (items replaces the whole list; moving it = a new day and/or time_local). If it is on the ' +
      'watch (sent_at set), send it again with health__send_workout (same ref replaces it) and mark_sent.',
    input: { type: 'object', properties: { id: { type: 'string' }, ...SESSION_PROPS, status: { type: 'string', enum: [...STATUSES] } }, required: ['id'] },
    run: (args, ctx) =>
      ctx.db(async (sql) => {
        const { id, ...fields } = args as unknown as SessionInput & { id: string };
        fail(sessionProblems(fields, false));
        await checkPlan(sql, p(ctx), fields.plan_id);
        if (!(await updateSession(sql, p(ctx), String(id), fields))) throw new ToolError(`No workout ${id}.`);
        const s = await sessionById(sql, p(ctx), String(id));
        return { updated: id, on_watch: !!s?.sent_at };
      })
  },
  {
    name: 'move_sessions',
    title: 'Shift workouts by days',
    readOnly: false,
    destructive: true,
    description: 'Move workouts by `days` (negative = earlier): the given ids, or every planned workout of plan_id from `from` on (e.g. a week off).',
    input: {
      type: 'object',
      properties: { days: { type: 'integer', minimum: -365, maximum: 365 }, ids: { type: 'array', items: { type: 'string' }, maxItems: 500 }, plan_id: { type: 'string' }, from: DAY },
      required: ['days']
    },
    run: (args, ctx) =>
      ctx.db(async (sql) => {
        let ids = (args.ids as string[] | undefined) ?? [];
        if (!ids.length && args.plan_id) {
          const rows = await sql`
            SELECT id FROM training.sessions WHERE profile_id = ${p(ctx)} AND plan_id = ${String(args.plan_id)} AND status = 'planned'
               AND day >= ${String(args.from ?? '1900-01-01')}::date`;
          ids = rows.map((r) => String(r.id));
        }
        if (!ids.length) throw new ToolError('Give ids, or plan_id (and from).');
        const moved = await moveSessions(sql, p(ctx), ids, Number(args.days));
        const onWatch = (await sql`SELECT id FROM training.sessions WHERE profile_id = ${p(ctx)} AND id = ANY(${ids}) AND sent_at IS NOT NULL`).map((r) => String(r.id));
        return { moved, on_watch_to_resend: onWatch };
      })
  },
  {
    name: 'delete_sessions',
    title: 'Delete workouts',
    readOnly: false,
    destructive: true,
    description: 'Delete workouts by id. Those that were on the watch come back as on_watch: remove them with health__remove_workout (ref "training:<id>").',
    input: { type: 'object', properties: { ids: { type: 'array', minItems: 1, maxItems: 500, items: { type: 'string' } } }, required: ['ids'] },
    run: (args, ctx) =>
      ctx.db(async (sql) => {
        const ids = (args.ids as string[]).map(String);
        const onWatch = (await sql`SELECT id FROM training.sessions WHERE profile_id = ${p(ctx)} AND id = ANY(${ids}) AND sent_at IS NOT NULL`).map((r) => String(r.id));
        return { deleted: await deleteSessions(sql, p(ctx), ids), on_watch: onWatch };
      })
  },
  {
    name: 'log_session',
    title: 'Log a workout as done or skipped',
    readOnly: false,
    destructive: true,
    description:
      'Record how a workout went: status done or skipped; items as really done (sets with reps, kg, seconds and done true; cardio ' +
      'done true), replacing the planned ones when given; result {rpe 0-10, note, started_at, finished_at}; activity_ref (e.g. the ' +
      'Garmin activity id from health__activities). Without id it logs a new workout (day, items, title?), e.g. an unplanned one.',
    input: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        status: { type: 'string', enum: ['done', 'skipped'] },
        items: ITEMS,
        result: { type: 'object' },
        activity_ref: { type: 'string', maxLength: 80 },
        day: DAY,
        title: { type: 'string', maxLength: 120 }
      },
      required: ['status']
    },
    run: (args, ctx) =>
      ctx.db(async (sql) => {
        const result = asResult(args.result);
        const items = args.items !== undefined ? (args.items as Item[]) : undefined;
        if (items !== undefined) fail(sessionProblems({ items }, false));
        let id = args.id ? String(args.id) : '';
        if (!id) {
          const s: SessionInput = { day: (args.day as string) ?? todayIn(), title: args.title as string | undefined, items: items ?? [] };
          fail(sessionProblems(s, true));
          id = await insertSession(sql, p(ctx), s, { source: 'claude' });
        }
        if (!(await logSession(sql, p(ctx), id, args.status as Status, result, { activityRef: (args.activity_ref as string) ?? null, items }))) throw new ToolError(`No workout ${id}.`);
        return { logged: id, status: args.status };
      })
  },
  {
    name: 'garmin_workout',
    title: 'The watch workout of a workout',
    readOnly: true,
    description:
      'The exact arguments for health__send_workout that put this workout on the Garmin watch (ref "training:<id>"): the blocks of its ' +
      'cardio items, one lap step per exercise; sauna and other minutes items stay in the note. Call health__send_workout with them, ' +
      'then mark_sent. null when nothing in it fits the watch.',
    input: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    run: (args, ctx) =>
      ctx.db(async (sql) => {
        const s = await sessionById(sql, p(ctx), String(args.id));
        if (!s) throw new ToolError(`No workout ${args.id}.`);
        return { send_workout: garminWorkout(s), on_watch: !!s.sent_at };
      })
  },
  {
    name: 'mark_sent',
    title: 'Record that a workout is on the watch',
    readOnly: false,
    description: 'After health__send_workout (sent true) or health__remove_workout (sent false): the page then shows it as on the watch, or not.',
    input: { type: 'object', properties: { id: { type: 'string' }, sent: { type: 'boolean' } }, required: ['id', 'sent'] },
    run: (args, ctx) =>
      ctx.db(async (sql) => {
        if (!(await setSent(sql, p(ctx), String(args.id), args.sent === true))) throw new ToolError(`No workout ${args.id}.`);
        return { id: args.id, on_watch: args.sent === true };
      })
  },
  {
    name: 'save_template',
    title: 'Save a reusable workout',
    readOnly: false,
    description: 'A template ("Full body A", "Long run 90 min", "Run + gym + sauna"): name, description, items. Give id to change one. Returns its id.',
    input: {
      type: 'object',
      properties: { id: { type: 'string' }, name: { type: 'string', minLength: 1, maxLength: 120 }, description: { type: 'string', maxLength: 4000 }, items: ITEMS },
      required: ['name', 'items']
    },
    run: (args, ctx) =>
      ctx.db(async (sql) => {
        fail(sessionProblems({ items: args.items as Item[] }, false));
        if (!cleanItems(args.items).length) throw new ToolError('items: at least one');
        return { id: await saveTemplate(sql, p(ctx), { id: args.id as string | undefined, name: String(args.name).trim(), description: (args.description as string) ?? null, items: args.items }) };
      })
  },
  {
    name: 'delete_template',
    title: 'Delete a reusable workout',
    readOnly: false,
    destructive: true,
    description: 'Delete a template; workouts made from it stay.',
    input: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    run: (args, ctx) =>
      ctx.db(async (sql) => {
        if (!(await deleteTemplate(sql, p(ctx), String(args.id)))) throw new ToolError(`No template ${args.id}.`);
        return { deleted: args.id };
      })
  },
  {
    name: 'exercises',
    title: 'The library of exercises',
    readOnly: true,
    description:
      'What can be an item of a workout: cardio (run, ride, swim...), exercises (reps, seconds or minutes, with muscles, a description ' +
      'and what to watch out for) and recovery (sauna, stretching), built in and the profile\'s own (custom). Search by words in the ' +
      `name or a muscle; group one of ${GROUPS.join(', ')}, or back_friendly. Use an entry's id as an item's ref.`,
    input: { type: 'object', properties: { query: { type: 'string', maxLength: 80 }, group: { type: 'string', enum: [...GROUPS, 'back_friendly'] } } },
    run: (args, ctx) =>
      ctx.db(async (sql) => {
        const list = searchLibrary(await fullLibrary(sql, p(ctx)), String(args.query ?? ''), String(args.group ?? ''), ctx.t);
        return { muscles: MUSCLES, entries: list };
      })
  },
  {
    name: 'save_exercise',
    title: 'Add an exercise to the library',
    readOnly: false,
    description:
      'The profile\'s own library entry: name, kind cardio (with sport) or exercise (with unit reps|seconds|minutes and muscles), ' +
      `description, cautions (what to watch out for). Muscles: ${Object.keys(MUSCLES).join(', ')}. Give id to change one of its own; what is left out then stays. ` +
      'An exercise can have a photo like the built-in ones (start position and end of the movement, Free Exercise DB): photo = an id from ' +
      'exercise_photos, "" removes it, leaving it out keeps the current one. Returns its id and whether the photo is there.',
    input: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        name: { type: 'string', minLength: 1, maxLength: 80 },
        kind: { type: 'string', enum: ['cardio', 'exercise'] },
        sport: { type: 'string', enum: [...SPORTS] },
        unit: { type: 'string', enum: [...UNITS] },
        muscles: { type: 'array', items: { type: 'string', enum: Object.keys(MUSCLES) }, maxItems: 8 },
        description: { type: 'string', maxLength: 2000 },
        cautions: { type: 'array', items: { type: 'string', maxLength: 200 }, maxItems: 10 },
        photo: { type: 'string', maxLength: 100, description: 'A Free Exercise DB id from exercise_photos, e.g. Lying_Leg_Curls; "" removes it.' }
      },
      required: []
    },
    run: (args, ctx) =>
      ctx.db(async (sql) => {
        const was = args.id ? (await customLibrary(sql, p(ctx))).find((e) => e.id === args.id) : undefined;
        if (args.id && !was) throw new ToolError(`No own entry ${args.id}; built-in entries cannot be changed.`);
        if (!was && (!args.name || !args.kind)) throw new ToolError('A new entry needs name and kind.');
        // Changing one: what is left out stays as it was (e.g. only a photo).
        const kind = (args.kind ?? was?.kind) === 'cardio' ? 'cardio' : 'exercise';
        const muscles = ((args.muscles as string[] | undefined) ?? was?.muscles ?? []).filter((m) => m in MUSCLES);
        const photo = args.photo === undefined ? undefined : args.photo === '' || kind === 'cardio' ? null : String(args.photo);
        if (photo && !isPhoto(photo)) throw new ToolError(`No photo ${photo}; find one with exercise_photos.`);
        const id = await saveCustomEntry(sql, p(ctx), {
          id: args.id as string | undefined,
          name: String(args.name ?? was?.name),
          kind,
          sport: (args.sport as string | undefined) ?? was?.sport ?? null,
          unit: UNITS.includes(args.unit as never) ? (args.unit as never) : (was?.unit ?? 'reps'),
          muscles,
          description: (args.description as string | undefined) ?? was?.description ?? null,
          cautions: (args.cautions as string[] | undefined) ?? was?.cautions ?? [],
          photo
        });
        return photo ? { id, photo, photo_ready: await keepPhoto(sql, p(ctx), photo) } : { id };
      })
  },
  {
    name: 'exercise_photos',
    title: 'Find a photo for an own exercise',
    readOnly: true,
    description:
      'Photos an own exercise can take, from the same source as the built-in ones (Free Exercise DB, public domain, two pictures each: ' +
      'start position and end of the movement). Search in English by name, equipment or muscle (e.g. "leg curl", "calf raise machine"). ' +
      'Give the chosen id as save_exercise photo. Each result has its pictures at app path /training/photo/<id>/0 and /1.',
    input: { type: 'object', properties: { query: { type: 'string', minLength: 1, maxLength: 80 } }, required: ['query'] },
    run: async (args) => ({ photos: searchPhotos(String(args.query ?? ''), 20) })
  },
  {
    name: 'delete_exercise',
    title: 'Delete an own library entry',
    readOnly: false,
    destructive: true,
    description: 'Delete one of the profile\'s own library entries; workouts that have it keep their items.',
    input: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    run: (args, ctx) =>
      ctx.db(async (sql) => {
        if (!(await deleteCustomEntry(sql, p(ctx), String(args.id)))) throw new ToolError(`No own entry ${args.id}.`);
        return { deleted: args.id };
      })
  }
];
