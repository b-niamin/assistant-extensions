/**
 * Tools for the AI (spec 005 of the core), as `health__<tool>` on the assistant's MCP server. The shell
 * already gives `describe` and read-only `query` over the health schema; these add the ready-made overview
 * and the one write the AI may do: a journal entry.
 */
import type { ExtTool } from '$shell';
import { latestReadings, recentActivities, recentSeries } from './lib/health.server';
import { METRICS } from './lib/metrics';

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
        return { profile: ctx.dataProfileId, latest, series, activities };
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
  }
];
