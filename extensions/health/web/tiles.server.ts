/** Dashboard tiles of the health extension (spec 003). Data only: the shell renders them. */
import type { ExtTile, Sql } from '$shell';
import { recentSeries } from './lib/health.server';
import { metricTile, readinessTile, RUN_SPORTS, runningTile, type WeekRow } from './lib/tiles';

async function runningWeeks(sql: Sql, profileId: string): Promise<WeekRow[]> {
  const rows = await sql<{ week: Date; km: number; runs: number }[]>`
    SELECT w::date AS week,
           COALESCE(sum(a.distance_m), 0)::float8 / 1000 AS km,
           count(a.activity_id)::int AS runs
    FROM generate_series(date_trunc('week', current_date) - interval '7 weeks', date_trunc('week', current_date), interval '1 week') w
    LEFT JOIN health.synced_activities a
      ON a.profile_id = ${profileId} AND a.sport = ANY(${RUN_SPORTS})
     AND date_trunc('week', left(a.start_time_local, 10)::date) = w
    GROUP BY w ORDER BY w`;
  return rows.map((r) => ({ week: r.week instanceof Date ? r.week.toISOString().slice(0, 10) : String(r.week), km: Number(r.km), runs: r.runs }));
}

// Garmin days are local days; sv-SE prints YYYY-MM-DD in the server's time zone.
const today = () => new Date().toLocaleDateString('sv-SE');

export const tiles: ExtTile[] = [
  {
    id: 'readiness',
    title: 'Readiness & HRV',
    size: 'md',
    load: (ctx) =>
      ctx.db(async (sql) => {
        const s = await recentSeries(sql, ctx.dataProfileId!, ['training_readiness', 'hrv'], 14);
        return readinessTile(s.training_readiness, s.hrv);
      })
  },
  {
    id: 'running-week',
    title: 'Running',
    size: 'md',
    load: (ctx) => ctx.db(async (sql) => runningTile(await runningWeeks(sql, ctx.dataProfileId!)))
  },
  {
    id: 'resting-hr',
    title: 'Resting heart rate',
    size: 'md',
    load: (ctx) =>
      ctx.db(async (sql) => {
        const s = await recentSeries(sql, ctx.dataProfileId!, ['resting_heart_rate'], 30);
        return metricTile('resting_heart_rate', s.resting_heart_rate, 'red', today());
      })
  },
  {
    id: 'sleep',
    title: 'Sleep',
    size: 'md',
    load: (ctx) =>
      ctx.db(async (sql) => {
        const s = await recentSeries(sql, ctx.dataProfileId!, ['sleep'], 14);
        return metricTile('sleep', s.sleep, 'violet', today());
      })
  }
];
