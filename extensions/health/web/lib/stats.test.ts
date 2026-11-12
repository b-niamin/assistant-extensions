import { describe, expect, it } from 'vitest';
import { ago, daysBetween, deltaVsBaseline, readinessLevel, shortDay } from './stats';

const pts = (vals: (number | null)[]) => vals.map((value, i) => ({ day: `2026-11-${String(i + 1).padStart(2, '0')}`, value }));

describe('deltaVsBaseline', () => {
  it('compares the latest reading with the mean of the previous seven', () => {
    const d = deltaVsBaseline({ goodWhen: 'up' }, pts([1, 50, 50, 50, 50, 50, 50, 50, 60]));
    expect(d?.baseline).toBe(50);
    expect(d?.diff).toBe(10);
    expect(d?.tone).toBe('good');
  });
  it('flips the tone for metrics where lower is better', () => {
    expect(deltaVsBaseline({ goodWhen: 'down' }, pts([50, 50, 50, 60]))?.tone).toBe('bad');
  });
  it('calls small moves flat and skips gaps', () => {
    expect(deltaVsBaseline({ goodWhen: 'up' }, pts([100, null, 100, 100, 101]))?.tone).toBe('flat');
  });
  it('needs enough readings', () => {
    expect(deltaVsBaseline({ goodWhen: 'up' }, pts([1, null, 2, 3]))).toBeNull();
  });
});

describe('readinessLevel', () => {
  it('uses Garmin bands', () => {
    expect(readinessLevel(96)?.label).toBe('Prime');
    expect(readinessLevel(75)?.label).toBe('High');
    expect(readinessLevel(62)?.tone).toBe('warning');
    expect(readinessLevel(30)?.label).toBe('Low');
    expect(readinessLevel(10)?.tone).toBe('critical');
    expect(readinessLevel(null)).toBeNull();
  });
});

describe('dates', () => {
  it('formats short days', () => {
    expect(shortDay('2026-11-03')).toBe('3 Nov');
    expect(shortDay('2025-01-15', true)).toBe('15 Jan 2025');
  });
  it('counts days', () => {
    expect(daysBetween('2026-11-01', '2026-11-03')).toBe(2);
  });
  it('says how long ago', () => {
    const now = new Date('2026-11-03T12:00:00Z');
    expect(ago('2026-11-03T11:48:00Z', now)).toBe('12 min ago');
    expect(ago('2026-11-03T09:00:00Z', now)).toBe('3 h ago');
    expect(ago('2026-10-30T12:00:00Z', now)).toBe('4 d ago');
  });
});
