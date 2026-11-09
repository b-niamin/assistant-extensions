/** Turns the sync bookkeeping into the Garmin card of the settings panel. Pure, so it is unit-tested. */
import type { SourceStatus, SourceSync } from '$shell';

export interface SyncOverview {
  account: { status: string; connectedAt: string | null } | null;
  run: {
    kind: string;
    status: string;
    startedAt: string;
    finishedAt: string | null;
    error: string | null;
    progress: number | null;
    phase: string | null;
    heartbeatAt: string | null;
    since: string | null;
  } | null;
  lastOkAt: string | null;
  /** The oldest request not finished yet; started = garmin-sync is on it. */
  pending: { kind: string; since: string | null; started: boolean; requestedAt: string } | null;
  /** Last tick of the garmin-sync loop (connected_accounts.checked_at); null = it never ticked. */
  serviceAt: string | null;
  nextRunAt: string | null;
  /** How far back the daily metrics have been fetched (backfill frontier). */
  historyTo: string | null;
  firstDay: string | null;
  days: number;
  activities: number;
  firstActivity: string | null;
}

/** A running pass that has not reported for this long was cut off. */
export const STALE_MS = 15 * 60_000;
/** The loop picks requests up within seconds: one waiting this long next to a silent loop will not start. */
export const STUCK_MS = 2 * 60_000;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function longDay(d: string): string {
  const [y, m, dd] = d.slice(0, 10).split('-').map(Number);
  return `${dd} ${MONTHS[m - 1]} ${y}`;
}

function shiftDays(day: string, days: number): string {
  return new Date(Date.parse(`${day.slice(0, 10)}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

function shiftYears(today: string, years: number): string {
  const [y, m, d] = today.split('-').map(Number);
  return `${y - years}-${String(m).padStart(2, '0')}-${String(Math.min(d, 28)).padStart(2, '0')}`;
}

const ERRORS: Record<string, string> = {
  token_rejected: 'Garmin no longer accepts the login: sign in again.',
  rate_limited: 'Garmin asked to slow down; the next pass tries again.',
  interrupted: 'The sync was cut off (the service restarted); it resumes on the next pass.'
};
export const errorText = (e: string) => ERRORS[e.split(':')[0]] ?? e;

export function isRunning(o: SyncOverview, now: number): boolean {
  const r = o.run;
  if (!r || r.status !== 'running') return false;
  return now - Date.parse(r.heartbeatAt ?? r.startedAt) < STALE_MS;
}

/** A request waits, yet the loop has not ticked lately: it is down or an old one that ignores requests. */
export function isStuck(o: SyncOverview, now: number): boolean {
  const p = o.pending;
  if (!p || p.started || isRunning(o, now) || now - Date.parse(p.requestedAt) < STUCK_MS) return false;
  return !o.serviceAt || now - Date.parse(o.serviceAt) >= STUCK_MS;
}

export const STUCK_TEXT =
  'The sync service is not picking up requests. It restarts itself after its next scheduled pass; to restart it now, run in the assistant folder: docker compose restart garmin-sync';

/** "Fetch older data" makes sense only before the day the history is already checked back to. */
export function olderLimit(o: SyncOverview, today: string): string {
  return o.historyTo ? shiftDays(o.historyTo, -1) : today;
}

export function describeSync(o: SyncOverview, now: number): SourceSync {
  const r = o.run;
  const base = { lastAt: o.lastOkAt, nextAt: o.nextRunAt };
  if (isRunning(o, now)) {
    const label = r!.phase ?? (r!.kind === 'backfill' ? 'Fetching history' : 'Syncing');
    return { ...base, state: 'running', progress: r!.progress, label: r!.kind === 'backfill' && r!.since ? `${label} (back to ${longDay(r!.since)})` : label };
  }
  if (isStuck(o, now)) return { ...base, state: 'failed', error: STUCK_TEXT };
  if (o.pending) {
    return {
      ...base,
      state: 'queued',
      progress: null,
      label: o.pending.kind === 'backfill' ? `History fetch ${o.pending.since ? `back to ${longDay(o.pending.since)}` : '(whole history)'} starts soon` : 'Sync starts soon'
    };
  }
  if (r && r.status === 'failed') return { ...base, state: 'failed', error: errorText(r.error ?? 'failed') };
  if (r && r.status === 'running') return { ...base, state: 'failed', error: errorText('interrupted') };
  return { ...base, state: 'idle', label: r?.status === 'partial' ? 'Last pass skipped some data; it retries next time.' : undefined };
}

function olderDefault(o: SyncOverview, today: string): string {
  return o.historyTo ? shiftYears(o.historyTo.slice(0, 10), 1) : shiftYears(today, 2);
}

export function garminSource(o: SyncOverview, today: string, loginCommand: string, now = Date.now()): SourceStatus {
  const status = o.account?.status ?? (o.run ? 'connected' : 'disconnected');
  const state = status === 'reconnect' ? 'reconnect' : status === 'connected' ? 'connected' : 'not_connected';
  const src: SourceStatus = { id: 'garmin', name: 'Garmin Connect', state };
  if (state === 'not_connected') {
    src.help = 'Sign in once in the terminal (on the server, in the assistant folder). Your password is never stored, only an encrypted login.';
    src.command = loginCommand;
    return src;
  }
  if (state === 'reconnect') {
    src.help = 'Garmin no longer accepts the saved login. Sign in again in the terminal:';
    src.command = loginCommand;
  }
  if (o.account?.connectedAt) src.account = `Connected on ${longDay(o.account.connectedAt)}`;
  const from = [o.firstDay, o.firstActivity].filter((d): d is string => !!d).sort()[0];
  src.facts = [
    { label: 'Data since', value: from ? longDay(from) : 'nothing yet' },
    { label: 'Days with data', value: o.days.toLocaleString('en-US') },
    { label: 'Activities', value: o.activities.toLocaleString('en-US') }
  ];
  if (o.historyTo) src.facts.push({ label: 'History checked back to', value: longDay(o.historyTo) });
  const busy = isRunning(o, now) || (!!o.pending && !isStuck(o, now));
  const off = busy || state !== 'connected';
  const why = busy ? 'Wait for the current sync to finish.' : undefined;
  src.actions = [
    { id: 'sync-now', label: 'Sync now', disabled: off, help: why },
    {
      id: 'fetch-older',
      label: 'Fetch older data',
      date: { label: 'Back to', default: olderDefault(o, today), min: '2000-01-01', max: olderLimit(o, today) },
      disabled: off,
      help: busy ? undefined : 'Sleep, HRV, Body Battery and the other daily data, weight and activities. Already fetched days are skipped.'
    }
  ];
  return src;
}
