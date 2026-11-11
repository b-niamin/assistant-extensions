import { describe, expect, it } from 'vitest';
import { normalizeEvents, offsetMinutes, sortEvents, todayBounds } from './calendar';

describe('time zone helpers', () => {
  it('knows Warsaw is UTC+1 in November and +2 in July', () => {
    expect(offsetMinutes('Europe/Warsaw', new Date('2026-11-11T12:00:00Z'))).toBe(60);
    expect(offsetMinutes('Europe/Warsaw', new Date('2026-07-11T12:00:00Z'))).toBe(120);
  });
  it("gives today's bounds in the house's zone", () => {
    expect(todayBounds('Europe/Warsaw', new Date('2026-11-11T23:30:00Z'))).toEqual({
      day: '2026-11-12',
      start: '2026-11-12T00:00:00+01:00',
      end: '2026-11-13T00:00:00+01:00'
    });
  });
  it('handles the switch to summer time', () => {
    expect(todayBounds('Europe/Warsaw', new Date('2026-03-29T10:00:00Z'))).toEqual({
      day: '2026-03-29',
      start: '2026-03-29T00:00:00+01:00',
      end: '2026-03-30T00:00:00+02:00'
    });
  });
});

describe('normalizeEvents', () => {
  const events = normalizeEvents(
    [
      { summary: 'Dentist', start: { dateTime: '2026-11-11T15:30:00+01:00' }, end: { dateTime: '2026-11-11T16:00:00+01:00' }, location: 'Mokotów' },
      { summary: 'Holiday', start: { date: '2026-11-11' }, end: { date: '2026-11-12' } },
      { summary: 'Yesterday', start: { date: '2026-11-10' }, end: { date: '2026-11-11' } },
      { summary: 'Night shift', start: { dateTime: '2026-11-10T22:00:00+01:00' }, end: { dateTime: '2026-11-11T06:00:00+01:00' } },
      { start: { dateTime: '2026-11-11T09:00:00+01:00' }, end: { dateTime: '2026-11-11T09:30:00+01:00' } }
    ],
    'Family',
    'Europe/Warsaw',
    '2026-11-11'
  );
  it('keeps what covers today, with times in the zone', () => {
    expect(sortEvents(events).map((e) => [e.title, e.when])).toEqual([
      ['Holiday', 'All day'],
      ['Night shift', 'until 06:00'],
      ['(no title)', '09:00–09:30'],
      ['Dentist', '15:30–16:00']
    ]);
  });
});
