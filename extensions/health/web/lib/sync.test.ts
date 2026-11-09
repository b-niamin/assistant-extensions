import { describe, expect, it } from 'vitest';
import { describeSync, garminSource, STALE_MS, type SyncOverview } from './sync';

const NOW = Date.parse('2026-11-09T12:00:00Z');
const base: SyncOverview = {
  account: { status: 'connected', connectedAt: '2026-11-03T10:00:00Z' },
  run: null,
  lastOkAt: '2026-11-09T11:30:00Z',
  pending: null,
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
    expect(describeSync({ ...base, pending: { kind: 'incremental', since: null, started: false } }, NOW).state).toBe('queued');
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
    expect(older?.disabled).toBe(false);
  });
});
