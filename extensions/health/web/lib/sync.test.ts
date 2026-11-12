import { describe, expect, it } from 'vitest';
import { describeSync, garminSource, STALE_MS, STUCK_MS, type SyncOverview } from './sync';

const NOW = Date.parse('2026-11-09T12:00:00Z');
const base: SyncOverview = {
  account: { status: 'connected', connectedAt: '2026-11-03T10:00:00Z' },
  run: null,
  lastOkAt: '2026-11-09T11:30:00Z',
  pending: null,
  serviceAt: '2026-11-09T11:59:58Z',
  nextRunAt: null,
  historyTo: null,
  firstDay: '2026-11-03',
  days: 7,
  activities: 4,
  firstActivity: '2026-10-30'
};
const run = (over: Partial<NonNullable<SyncOverview['run']>>) => ({
  kind: 'backfill',
  status: 'running',
  startedAt: '2026-11-09T11:55:00Z',
  finishedAt: null,
  error: null,
  progress: 0.4,
  phase: 'Fetching history: March 2025',
  heartbeatAt: '2026-11-09T11:59:50Z',
  since: '2024-11-01',
  ...over
});

const waiting = (ageMs: number) => ({
  kind: 'backfill',
  since: '2024-11-09',
  started: false,
  requestedAt: new Date(NOW - ageMs).toISOString()
});

describe('describeSync', () => {
  it('shows a running pass with its progress', () => {
    const s = describeSync({ ...base, run: run({}) }, NOW);
    expect(s.state).toBe('running');
    expect(s.progress).toBe(0.4);
    expect(s.label).toContain('back to 1 Nov 2024');
  });
  it('treats a silent running pass as cut off', () => {
    const old = new Date(NOW - STALE_MS - 1000).toISOString();
    const s = describeSync({ ...base, run: run({ heartbeatAt: old }) }, NOW);
    expect(s.state).toBe('failed');
    expect(s.error).toMatch(/cut off/);
  });
  it('shows a waiting request as queued', () => {
    expect(describeSync({ ...base, pending: waiting(10_000) }, NOW).state).toBe('queued');
  });
  it('flags a request that a silent service never picks up', () => {
    const silent = new Date(NOW - STUCK_MS - 60_000).toISOString();
    const s = describeSync({ ...base, pending: waiting(STUCK_MS + 1000), serviceAt: silent }, NOW);
    expect(s.state).toBe('failed');
    expect(s.error).toMatch(/System settings -> Worker/);
    expect(describeSync({ ...base, pending: waiting(STUCK_MS + 1000), serviceAt: null }, NOW).state).toBe('failed');
    // A loop that still ticks is busy with something else: keep waiting.
    expect(describeSync({ ...base, pending: waiting(STUCK_MS + 1000) }, NOW).state).toBe('queued');
  });
  it('explains a rejected token', () => {
    const s = describeSync({ ...base, run: run({ status: 'failed', error: 'token_rejected: HTTP 401' }) }, NOW);
    expect(s.error).toMatch(/sign in again/);
  });
});

describe('garminSource', () => {
  it('asks to sign in when there is no account', () => {
    const s = garminSource({ ...base, account: null }, '2026-11-09', 'login');
    expect(s.state).toBe('not_connected');
    expect(s.command).toBe('login');
    expect(s.actions).toBeUndefined();
  });
  it('reports the oldest data and offers a history fetch two years back', () => {
    const s = garminSource(base, '2026-11-09', 'login');
    expect(s.facts?.[0]).toEqual({ label: 'Data since', value: '30 Oct 2026' });
    const older = s.actions?.find((a) => a.id === 'fetch-older');
    expect(older?.date?.default).toBe('2024-11-09');
    expect(older?.date?.max).toBe('2026-11-09');
    expect(older?.disabled).toBe(false);
  });
  it('offers only days before the history already checked', () => {
    const s = garminSource({ ...base, historyTo: '2021-11-10' }, '2026-11-09', 'login', NOW);
    const older = s.actions?.find((a) => a.id === 'fetch-older');
    expect(older?.date?.default).toBe('2020-11-10');
    expect(older?.date?.max).toBe('2021-11-09');
  });
  it('blocks the buttons while a request waits, frees them when the service is gone', () => {
    const queued = garminSource({ ...base, pending: waiting(10_000) }, '2026-11-09', 'login', NOW);
    expect(queued.actions?.every((a) => a.disabled)).toBe(true);
    const stuck = garminSource({ ...base, pending: waiting(STUCK_MS + 1000), serviceAt: null }, '2026-11-09', 'login', NOW);
    expect(stuck.actions?.some((a) => a.disabled)).toBe(false);
  });
});
