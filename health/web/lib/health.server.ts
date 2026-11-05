/** Reads for the health extension. Everything is scoped to one profile; `sql` runs as role ext_health. */
import type { Sql } from '$shell';
import { extractValue, METRICS, specOf, type MetricKey } from './metrics';

export interface DayValue {
  day: string;
  value: number | null;
}

export interface LatestReading {
  key: MetricKey;
  day: string | null;
  value: number | null;
}

const asDay = (d: unknown): string => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d));

/** The newest real reading of each daily metric (Garmin often uploads a day late). */
export async function latestReadings(sql: Sql, profileId: string): Promise<LatestReading[]> {
  const rows = await sql<{ metric: string; day: Date; data: unknown }[]>`
    SELECT DISTINCT ON (metric) metric, day, data
    FROM health.synced_metric_days
    WHERE profile_id = ${profileId} AND COALESCE(has_value, data IS NOT NULL)
      AND day >= current_date - 14
    ORDER BY metric, day DESC`;
  return METRICS.map((spec) => {
    const row = rows.find((r) => r.metric === spec.key);
    return { key: spec.key, day: row ? asDay(row.day) : null, value: row ? extractValue(spec, row.data) : null };
  });
}

export async function metricSeries(sql: Sql, profileId: string, key: MetricKey, days: number): Promise<DayValue[]> {
  const spec = specOf(key);
  if (!spec) return [];
  const rows = await sql<{ day: Date; data: unknown }[]>`
    SELECT d::date AS day, m.data
    FROM generate_series(current_date - ${days - 1}::int, current_date, interval '1 day') d
    LEFT JOIN health.synced_metric_days m
      ON m.profile_id = ${profileId} AND m.metric = ${key} AND m.day = d::date
    ORDER BY d`;
  return rows.map((r) => ({ day: asDay(r.day), value: r.data == null ? null : extractValue(spec, r.data) }));
}

/** Daily series for several metrics at once (one query), for the stat-tile sparklines. */
export async function recentSeries(sql: Sql, profileId: string, keys: MetricKey[], days: number): Promise<Record<string, DayValue[]>> {
  const rows = await sql<{ metric: string; day: Date; data: unknown }[]>`
    SELECT k.metric, d::date AS day, m.data
    FROM unnest(${keys}::text[]) AS k(metric)
    CROSS JOIN generate_series(current_date - ${days - 1}::int, current_date, interval '1 day') d
    LEFT JOIN health.synced_metric_days m
      ON m.profile_id = ${profileId} AND m.metric = k.metric AND m.day = d::date
    ORDER BY k.metric, d`;
  const out: Record<string, DayValue[]> = {};
  for (const key of keys) {
    const spec = specOf(key)!;
    out[key] = rows
      .filter((r) => r.metric === key)
      .map((r) => ({ day: asDay(r.day), value: r.data == null ? null : extractValue(spec, r.data) }));
  }
  return out;
}

export interface ActivityRow {
  activity_id: string;
  sport: string;
  name: string | null;
  start_time_local: string;
  distance_m: number | null;
  duration_s: number | null;
  avg_hr: number | null;
  training_load: number | null;
}

export async function recentActivities(sql: Sql, profileId: string, limit = 20): Promise<ActivityRow[]> {
  return sql<ActivityRow[]>`
    SELECT activity_id, sport, name, start_time_local, distance_m, duration_s, avg_hr, training_load
    FROM health.synced_activities
    WHERE profile_id = ${profileId}
    ORDER BY start_time DESC
    LIMIT ${limit}`;
}

export interface SyncStatus {
  connected: boolean;
  lastRun: { status: string; started_at: Date; finished_at: Date | null; error: string | null } | null;
}

export async function syncStatus(sql: Sql, profileId: string): Promise<SyncStatus> {
  const [run] = await sql<NonNullable<SyncStatus['lastRun']>[]>`
    SELECT status, started_at, finished_at, error FROM health.sync_runs
    WHERE profile_id = ${profileId} ORDER BY started_at DESC LIMIT 1`;
  const [state] = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM health.sync_state WHERE profile_id = ${profileId}`;
  return { connected: (state?.n ?? 0) > 0 || !!run, lastRun: run ?? null };
}
