import { describe, expect, it } from 'vitest';
import { monthGrid, pickMonth, shiftMonth } from './month';
import { daysOf, localWhen } from './view';

describe('month grid', () => {
  it('covers the month in whole weeks from Monday', () => {
    const g = monthGrid('2026-11');
    expect(g.first).toBe('2026-10-26');
    expect(g.last).toBe('2026-12-06');
    expect(g.weeks).toHaveLength(6);
    expect(monthGrid('2027-02').weeks).toHaveLength(4);
  });
  it('picks the month from the query, else today', () => {
    expect(pickMonth(null, null, '2026-11-14')).toEqual({ month: '2026-11', selected: '2026-11-14' });
    expect(pickMonth('2026-12', null, '2026-11-14')).toEqual({ month: '2026-12', selected: '2026-12-01' });
    expect(pickMonth(null, '2027-01-05', '2026-11-14')).toEqual({ month: '2027-01', selected: '2027-01-05' });
    expect(pickMonth('junk', 'nope', '2026-11-14')).toEqual({ month: '2026-11', selected: '2026-11-14' });
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
  });
});

describe('how entries read', () => {
  const tz = 'Europe/Warsaw';
  it('spreads long entries over their days', () => {
    expect(daysOf({ allDay: true, start: '2026-11-14', end: '2026-11-17' }, tz)).toEqual(['2026-11-14', '2026-11-15', '2026-11-16']);
    expect(daysOf({ allDay: false, start: '2026-11-14T21:00:00Z', end: '2026-11-14T23:00:00Z' }, tz)).toEqual(['2026-11-14']);
    expect(daysOf({ allDay: false, start: '2026-11-14T22:00:00Z', end: '2026-11-15T03:00:00Z' }, tz)).toEqual(['2026-11-14', '2026-11-15']);
  });
  it('says when in local time', () => {
    expect(localWhen({ allDay: false, start: '2026-11-14T17:30:00Z', end: '2026-11-14T18:30:00Z' }, tz)).toBe('2026-11-14 18:30–19:30');
    expect(localWhen({ allDay: true, start: '2026-11-14', end: '2026-11-15' }, tz)).toBe('2026-11-14');
    expect(localWhen({ allDay: true, start: '2026-11-14', end: '2026-11-16' }, tz)).toBe('2026-11-14 – 2026-11-15');
  });
});
