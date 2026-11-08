import { describe, expect, it } from 'vitest';
import { isoWeek, metricTile, readinessTile, runningTile } from './tiles';

const days = (vals: (number | null)[], end = '2026-11-06') =>
  vals.map((value, i) => {
    const d = new Date(`${end}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - (vals.length - 1 - i));
    return { day: d.toISOString().slice(0, 10), value };
  });

describe('health tiles', () => {
  it('numbers ISO weeks', () => {
    expect(isoWeek('2026-11-02')).toBe(45);
    expect(isoWeek('2026-01-01')).toBe(1);
    expect(isoWeek('2024-12-30')).toBe(1);
  });
  it('compares this week of running with the 4 before', () => {
    const weeks = [10, 20, 30, 40, 50, 30, 30, 12.34].map((km, i) => ({ week: `2026-09-${String(14 + i).padStart(2, '0')}`, km, runs: 2 }));
    const t = runningTile(weeks);
    expect(t.kpis?.[0]).toMatchObject({ value: 12.3, delta: -25.2 });
    expect(t.series?.kind).toBe('bars');
    expect(t.series?.points).toHaveLength(8);
  });
  it('shows an empty state without runs', () => {
    expect(runningTile([{ week: '2026-11-02', km: 0, runs: 0 }]).empty).toBeDefined();
  });
  it('labels the latest reading and its delta', () => {
    const t = metricTile('resting_heart_rate', days([50, 50, 50, 50, 50, 50, 50, 47, null]), 'red', '2026-11-06');
    expect(t.kpis?.[0]).toMatchObject({ label: 'Last night', value: 47, delta: -3, better: 'down', unit: 'bpm' });
    expect(t.series?.hue).toBe('red');
  });
  it('readiness carries Garmin band and HRV', () => {
    const t = readinessTile(days([60, 81]), days([40, 42, 44, 46, 50]));
    expect(t.kpis?.[0]).toMatchObject({ value: 81, status: { label: 'High', tone: 'good' } });
    expect(t.kpis?.[1]).toMatchObject({ label: 'HRV', value: 50, unit: 'ms' });
  });
});
