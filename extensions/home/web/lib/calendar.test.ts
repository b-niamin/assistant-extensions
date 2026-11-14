import { describe, expect, it } from 'vitest';
import type { SharedEntry } from '$shell';
import { boardEvents, haEntries, offsetMinutes, sortEvents, todayBounds } from './calendar';

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

describe('Home Assistant events on the shared calendar, and today on the board', () => {
  const entries = haEntries(
    [
      { summary: 'Dentist', start: { dateTime: '2026-11-11T15:30:00+01:00' }, end: { dateTime: '2026-11-11T16:00:00+01:00' }, location: 'Mokotów' },
      { summary: 'Holiday', start: { date: '2026-11-11' }, end: { date: '2026-11-12' } },
      { summary: 'Yesterday', start: { date: '2026-11-10' }, end: { date: '2026-11-11' } },
      { summary: 'Night shift', start: { dateTime: '2026-11-10T22:00:00+01:00' }, end: { dateTime: '2026-11-11T06:00:00+01:00' } },
      { start: { dateTime: '2026-11-11T09:00:00+01:00' }, end: { dateTime: '2026-11-11T09:30:00+01:00' } },
      { summary: 'No start' }
    ],
    'calendar.family',
    'Family'
  );
  it('keeps days as days and times with their offset', () => {
    expect(entries).toHaveLength(5);
    expect(entries[0]).toEqual({
      id: 'calendar.family|2026-11-11T15:30:00+01:00|Dentist',
      title: 'Dentist',
      start: '2026-11-11T15:30:00+01:00',
      end: '2026-11-11T16:00:00+01:00',
      kind: 'Family',
      location: 'Mokotów',
      href: '/home'
    });
  });
  it("shows what covers today, with times in the house's zone", () => {
    // What the shell hands out: all-day flag, instants in UTC, the source.
    const shared: SharedEntry[] = entries.map((e) => ({
      ...e,
      allDay: e.start.length === 10,
      start: e.start.length === 10 ? e.start : new Date(e.start).toISOString(),
      end: e.start.length === 10 ? e.end! : new Date(e.end!).toISOString(),
      source: { extension: 'home', name: 'Home' }
    }));
    expect(sortEvents(boardEvents(shared, 'Europe/Warsaw', '2026-11-11')).map((e) => [e.title, e.when, e.calendar])).toEqual([
      ['Holiday', 'All day', 'Family'],
      ['Night shift', 'until 06:00', 'Family'],
      ['(no title)', '09:00–09:30', 'Family'],
      ['Dentist', '15:30–16:00', 'Family']
    ]);
  });
});
