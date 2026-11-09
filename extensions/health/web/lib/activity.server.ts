/** Reads for one activity's page. Scoped to one profile; `sql` runs as role ext_health. */
import type { Sql } from '$shell';

export interface ActivityDetail {
  activity_id: string;
  sport: string;
  name: string | null;
  start_time_local: string;
  distance_m: number | null;
  duration_s: number | null;
  moving_s: number | null;
  elevation_gain_m: number | null;
  avg_hr: number | null;
  max_hr: number | null;
  avg_power: number | null;
  max_power: number | null;
  norm_power: number | null;
  calories: number | null;
  training_load: number | null;
  has_gps: boolean;
  raw: Record<string, unknown> | null;
}

export async function activityById(sql: Sql, profileId: string, id: string) {
  const [[a], [s], [j], [prev], [next]] = await Promise.all([
    sql<ActivityDetail[]>`
      SELECT activity_id, sport, name, start_time_local, distance_m, duration_s, moving_s, elevation_gain_m,
             avg_hr, max_hr, avg_power, max_power, norm_power, calories, training_load, has_gps, raw
      FROM health.synced_activities WHERE profile_id = ${profileId} AND activity_id = ${id}`,
    sql<{ streams: Record<string, unknown> }[]>`
      SELECT streams FROM health.synced_activity_streams WHERE profile_id = ${profileId} AND activity_id = ${id}`,
    sql<{ rpe: number | null; soreness: number | null; mood: number | null; note: string | null }[]>`
      SELECT rpe, soreness, mood, note FROM health.journal_entries WHERE profile_id = ${profileId} AND activity_id = ${id}`,
    sql<{ activity_id: string }[]>`
      SELECT activity_id FROM health.synced_activities
      WHERE profile_id = ${profileId}
        AND start_time < (SELECT start_time FROM health.synced_activities WHERE profile_id = ${profileId} AND activity_id = ${id})
      ORDER BY start_time DESC LIMIT 1`,
    sql<{ activity_id: string }[]>`
      SELECT activity_id FROM health.synced_activities
      WHERE profile_id = ${profileId}
        AND start_time > (SELECT start_time FROM health.synced_activities WHERE profile_id = ${profileId} AND activity_id = ${id})
      ORDER BY start_time LIMIT 1`
  ]);
  return { activity: a ?? null, streams: s?.streams ?? null, journal: j ?? null, prev: prev?.activity_id ?? null, next: next?.activity_id ?? null };
}
