/** Reads behind the Garmin card in System settings: account, current/last pass, queue and coverage. */
import type { Sql } from '$shell';
import type { SyncOverview } from './sync';

const iso = (v: unknown): string | null => (v instanceof Date ? v.toISOString() : v == null ? null : String(v));
const day = (v: unknown): string | null => (v instanceof Date ? v.toISOString().slice(0, 10) : v == null ? null : String(v).slice(0, 10));

export async function syncOverview(sql: Sql, profileId: string): Promise<SyncOverview> {
  const [[account], [run], [lastOk], [pending], [state], [cov]] = await Promise.all([
    sql`SELECT status, connected_at, checked_at FROM health.connected_accounts WHERE profile_id = ${profileId} AND source = 'garmin'`,
    sql`SELECT kind, status, started_at, finished_at, error, progress, phase, heartbeat_at, since
        FROM health.sync_runs WHERE profile_id = ${profileId} ORDER BY started_at DESC LIMIT 1`,
    sql`SELECT finished_at FROM health.sync_runs
        WHERE profile_id = ${profileId} AND status IN ('ok', 'partial') ORDER BY started_at DESC LIMIT 1`,
    sql`SELECT kind, since, started_at, requested_at FROM health.sync_requests
        WHERE profile_id = ${profileId} AND finished_at IS NULL ORDER BY requested_at LIMIT 1`,
    sql`SELECT cursor FROM health.sync_state WHERE profile_id = ${profileId} AND source = 'garmin'`,
    sql`SELECT
          (SELECT min(day) FROM health.synced_metric_days WHERE profile_id = ${profileId} AND has_value) AS first_day,
          (SELECT count(DISTINCT day)::int FROM health.synced_metric_days WHERE profile_id = ${profileId} AND has_value) AS days,
          (SELECT count(*)::int FROM health.synced_activities WHERE profile_id = ${profileId}) AS activities,
          (SELECT min(start_time_local) FROM health.synced_activities WHERE profile_id = ${profileId}) AS first_activity`
  ]);
  const cursor = (state?.cursor ?? {}) as Record<string, unknown>;
  return {
    account: account ? { status: String(account.status), connectedAt: iso(account.connected_at) } : null,
    run: run
      ? {
          kind: String(run.kind),
          status: String(run.status),
          startedAt: iso(run.started_at)!,
          finishedAt: iso(run.finished_at),
          error: run.error ?? null,
          progress: run.progress ?? null,
          phase: run.phase ?? null,
          heartbeatAt: iso(run.heartbeat_at),
          since: day(run.since)
        }
      : null,
    lastOkAt: iso(lastOk?.finished_at),
    pending: pending
      ? { kind: String(pending.kind), since: day(pending.since), started: pending.started_at != null, requestedAt: iso(pending.requested_at)! }
      : null,
    serviceAt: iso(account?.checked_at),
    nextRunAt: typeof cursor.nextRunAt === 'string' ? cursor.nextRunAt : null,
    historyTo: typeof cursor.metricsBackfilledTo === 'string' ? cursor.metricsBackfilledTo : null,
    firstDay: day(cov?.first_day),
    days: cov?.days ?? 0,
    activities: cov?.activities ?? 0,
    firstActivity: cov?.first_activity ? String(cov.first_activity).slice(0, 10) : null
  };
}
