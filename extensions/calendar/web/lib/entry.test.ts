import { describe, expect, it } from 'vitest';
import { ownId, parseEntry, toEntry } from './entry';

const tz = 'Europe/Warsaw';

describe('parseEntry', () => {
  it('makes an all-day entry with an exclusive end', () => {
    expect(parseEntry({ title: ' Trip ', date: '2026-11-14', end_date: '2026-11-16' }, tz)).toEqual({
      row: { title: 'Trip', all_day: true, start_at: null, end_at: null, start_day: '2026-11-14', end_day: '2026-11-17', location: null, note: null }
    });
  });
  it('makes a timed entry in the owner zone, an hour long by default', () => {
    const r = parseEntry({ title: 'Dentist', date: '2026-11-14', start_time: '18:30', location: 'Centrum' }, tz);
    expect('row' in r && r.row.start_at?.toISOString()).toBe('2026-11-14T17:30:00.000Z');
    expect('row' in r && r.row.end_at?.toISOString()).toBe('2026-11-14T18:30:00.000Z');
    const night = parseEntry({ title: 'Party', date: '2026-11-14', end_date: '2026-11-15', start_time: '22:00', end_time: '02:00' }, tz);
    expect('row' in night && night.row.end_at?.toISOString()).toBe('2026-11-15T01:00:00.000Z');
  });
  it('says what is wrong', () => {
    expect(parseEntry({ date: '2026-11-14' }, tz)).toEqual({ error: 'Give it a title.' });
    expect(parseEntry({ title: 'x', date: '14.11.2026' }, tz)).toEqual({ error: 'The date must be YYYY-MM-DD.' });
    expect(parseEntry({ title: 'x', date: '2026-11-14', end_date: '2026-11-13' }, tz)).toMatchObject({ error: expect.any(String) });
    expect(parseEntry({ title: 'x', date: '2026-11-14', start_time: '25:00' }, tz)).toMatchObject({ error: expect.any(String) });
    expect(parseEntry({ title: 'x', date: '2026-11-14', end_time: '10:00' }, tz)).toMatchObject({ error: expect.any(String) });
    expect(parseEntry({ title: 'x', date: '2026-11-14', start_time: '10:00', end_time: '09:00' }, tz)).toMatchObject({ error: expect.any(String) });
    expect(parseEntry({ title: 'x', date: '2026-01-01', end_date: '2028-01-01' }, tz)).toMatchObject({ error: expect.any(String) });
  });
});

describe('rows and ids', () => {
  it('turns rows into entries with a link to their day', () => {
    expect(toEntry({ id: 7, title: 'T', all_day: true, start_at: null, end_at: null, start_day: '2026-11-14', end_day: '2026-11-15', location: null, note: 'n' }, () => '')).toEqual({
      id: 'e7',
      title: 'T',
      note: 'n',
      start: '2026-11-14',
      end: '2026-11-15',
      href: '/calendar?d=2026-11-14'
    });
    const s = new Date('2026-11-14T23:30:00Z');
    expect(toEntry({ id: 8, title: 'T', all_day: false, start_at: s, end_at: s, start_day: null, end_day: null, location: null, note: null }, () => '2026-11-15').href).toBe('/calendar?d=2026-11-15');
  });
  it('knows its own ids', () => {
    expect(ownId('e42')).toBe(42);
    expect(ownId('f:abc:x')).toBeNull();
    expect(ownId('e')).toBeNull();
  });
});
