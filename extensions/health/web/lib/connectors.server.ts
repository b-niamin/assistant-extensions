/** Reads and queued writes of the connectors (Strava, Withings, the outbox), as the extension's role. */
import type { Sql } from '$shell';
import { mergedWeights, type Provider, type ProviderInfo, type Write } from './connectors';

const iso = (v: unknown): string | null => (v instanceof Date ? v.toISOString() : v == null ? null : String(v));
const day = (v: unknown): string => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));
const newId = () => crypto.randomUUID().replace(/-/g, '');

export async function providerInfo(sql: Sql, profileId: string, provider: Provider): Promise<ProviderInfo> {
  const [[acc], [state], [pending], [cov], [opt]] = await Promise.all([
    sql`SELECT status, connected_at FROM health.connected_accounts WHERE profile_id = ${profileId} AND source = ${provider}`,
    sql`SELECT last_sync_at FROM health.sync_state WHERE profile_id = ${profileId} AND source = ${provider}`,
    sql`SELECT 1 AS x FROM health.sync_requests WHERE profile_id = ${profileId} AND source = ${provider} AND finished_at IS NULL LIMIT 1`,
    provider === 'strava'
      ? sql`SELECT count(*)::int AS n, min(start_time) AS first, count(garmin_activity_id)::int AS linked
              FROM health.synced_strava_activities WHERE profile_id = ${profileId}`
      : sql`SELECT count(*)::int AS n, min(day) AS first FROM health.synced_weight WHERE profile_id = ${profileId} AND source = 'withings'`,
    sql`SELECT value FROM health.connector_options WHERE profile_id = ${profileId} AND key = 'withings_to_garmin'`
  ]);
  return {
    status: acc ? String(acc.status) : null,
    connectedAt: iso(acc?.connected_at),
    lastSyncAt: iso(state?.last_sync_at),
    count: cov?.n ?? 0,
    first: cov?.first ? day(cov.first) : null,
    linked: cov?.linked,
    pending: !!pending,
    toGarmin: !!(opt?.value as { on?: boolean } | undefined)?.on
  };
}

export async function requestSync(sql: Sql, profileId: string, source: string): Promise<void> {
  await sql`DELETE FROM health.sync_requests WHERE profile_id = ${profileId} AND source = ${source} AND started_at IS NULL`;
  await sql`INSERT INTO health.sync_requests (id, profile_id, source, kind) VALUES (${newId()}, ${profileId}, ${source}, 'incremental')`;
}

export async function setOption(sql: Sql, profileId: string, key: string, value: unknown): Promise<void> {
  await sql`
    INSERT INTO health.connector_options (profile_id, key, value) VALUES (${profileId}, ${key}, ${sql.json(value as never)})
    ON CONFLICT (profile_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`;
}

/** Queue one write for the connectors service; it runs within seconds. */
export async function queueWrite(sql: Sql, profileId: string, target: string, op: string, payload: Record<string, unknown>, by: string): Promise<string> {
  const id = newId();
  await sql`
    INSERT INTO health.outbox (id, profile_id, target, op, payload, requested_by)
    VALUES (${id}, ${profileId}, ${target}, ${op}, ${sql.json(payload as never)}, ${by})`;
  return id;
}

export async function writes(sql: Sql, profileId: string, opts: { ids?: string[]; limit?: number } = {}): Promise<Write[]> {
  const limit = Math.min(100, Math.max(1, opts.limit ?? 20));
  const rows = opts.ids?.length
    ? await sql`SELECT * FROM health.outbox WHERE profile_id = ${profileId} AND id = ANY(${opts.ids}) ORDER BY requested_at DESC`
    : await sql`SELECT * FROM health.outbox WHERE profile_id = ${profileId} ORDER BY requested_at DESC LIMIT ${limit}`;
  return rows.map((r) => ({
    id: String(r.id),
    target: String(r.target),
    op: String(r.op),
    state: String(r.state),
    error: r.error ?? null,
    result: r.result ?? null,
    requestedBy: r.requested_by ?? null,
    requestedAt: iso(r.requested_at)!,
    finishedAt: iso(r.finished_at)
  }));
}

export interface LinkedActivity {
  activity_id: string | null;
  sport: string;
  name: string | null;
  description: string | null;
  start_time: string;
  distance_m: number | null;
  duration_s: number | null;
  strava: { id: string; name: string | null; description: string | null } | null;
}

/** Garmin activities with their Strava twin, and Strava-only ones, newest first. */
export async function linkedActivities(sql: Sql, profileId: string, from: string, to: string, limit: number): Promise<LinkedActivity[]> {
  const rows = await sql`
    SELECT a.activity_id, a.sport, a.name, a.raw->>'description' AS description, a.start_time, a.distance_m, a.duration_s,
           s.strava_id, s.name AS s_name, s.description AS s_description
      FROM health.synced_activities a
      LEFT JOIN health.synced_strava_activities s ON s.profile_id = a.profile_id AND s.garmin_activity_id = a.activity_id
     WHERE a.profile_id = ${profileId} AND a.start_time >= ${from}::date AND a.start_time < ${to}::date + 1
    UNION ALL
    SELECT NULL, s.sport, NULL, NULL, s.start_time, s.distance_m, s.duration_s, s.strava_id, s.name, s.description
      FROM health.synced_strava_activities s
     WHERE s.profile_id = ${profileId} AND s.garmin_activity_id IS NULL AND s.start_time >= ${from}::date AND s.start_time < ${to}::date + 1
    ORDER BY start_time DESC LIMIT ${limit}`;
  return rows.map((r) => ({
    activity_id: r.activity_id ?? null,
    sport: String(r.sport),
    name: r.name ?? null,
    description: r.description ?? null,
    start_time: iso(r.start_time)!,
    distance_m: r.distance_m ?? null,
    duration_s: r.duration_s ?? null,
    strava: r.strava_id ? { id: String(r.strava_id), name: r.s_name ?? null, description: r.s_description ?? null } : null
  }));
}

export async function stravaOf(sql: Sql, profileId: string, activityId: string): Promise<string | null> {
  const [r] = await sql`SELECT strava_id FROM health.synced_strava_activities WHERE profile_id = ${profileId} AND garmin_activity_id = ${activityId} LIMIT 1`;
  return r ? String(r.strava_id) : null;
}

export async function weights(sql: Sql, profileId: string, days: number) {
  const rows = await sql<{ day: Date | string; source: string; kg: number }[]>`
    SELECT day, source, weight_kg::float8 AS kg FROM health.synced_weight
     WHERE profile_id = ${profileId} AND day > current_date - ${days}::int ORDER BY day`;
  return mergedWeights(rows.map((r) => ({ day: day(r.day), source: r.source, kg: Number(r.kg) })));
}

export async function pushedWorkouts(sql: Sql, profileId: string) {
  const rows = await sql`
    SELECT ref, garmin_workout_id, day, title, sport, updated_at FROM health.pushed_workouts
     WHERE profile_id = ${profileId} AND (day IS NULL OR day >= current_date - 7) ORDER BY day LIMIT 200`;
  return rows.map((r) => ({ ref: String(r.ref), garminWorkoutId: r.garmin_workout_id ?? null, day: r.day ? day(r.day) : null, title: r.title ?? null, sport: r.sport ?? null }));
}
