import { describe, expect, it } from 'vitest';
import { addItemTo, calendarKey, calendarsOf, nextHue, parseHidden, removeItemFrom, switchCalendar } from './calendars';

const src = (extension: string, name = extension) => ({ id: 'x', source: { extension, name } });

describe('calendarKey', () => {
  it('splits the calendar into its calendars and each subscription', () => {
    expect(calendarKey({ id: 'e12', href: '/calendar?d=2026-11-17&cal=3', source: { extension: 'calendar', name: 'Calendar' } })).toBe('cal:3');
    expect(calendarKey({ id: 'e12', source: { extension: 'calendar', name: 'Calendar' } })).toBe('calendar');
    expect(calendarKey({ id: 'f:ab12cd34ef:uid@x', source: { extension: 'calendar', name: 'Calendar' } })).toBe('calendar:ab12cd34ef');
    expect(calendarKey(src('training'))).toBe('training');
  });
});

describe('calendarsOf', () => {
  const rows = [
    { id: 1, name: 'Family', hue: 'violet', feed_id: null },
    { id: 2, name: 'Work', hue: 'blue', feed_id: 'aa11aa11aa' },
    { id: 3, name: 'Holidays', hue: 'green', feed_id: 'bb22bb22bb' }
  ];
  const sources = [
    { extension: 'calendar', name: 'Calendar', count: 3 },
    { extension: 'training', name: 'Training Plans', count: 1 },
    { extension: 'health', name: 'Training & Health Data', count: 0, error: 'timeout' }
  ];
  const feeds = [
    { id: 'aa11aa11aa', ok: true },
    { id: 'bb22bb22bb', ok: false }
  ];
  const entries = [
    { id: 'e1', href: '/calendar?d=2026-11-01&cal=1', source: { extension: 'calendar', name: 'Calendar' } },
    { id: 'f:aa11aa11aa:1', source: { extension: 'calendar', name: 'Calendar' } },
    { id: 'f:aa11aa11aa:2', source: { extension: 'calendar', name: 'Calendar' } },
    { id: 'w1', source: { extension: 'training', name: 'Training Plans' } }
  ];
  const list = calendarsOf(rows, sources, feeds, entries);

  it('lists the calendars added here in order, then the apps by name', () => {
    expect(list.map((c) => [c.key, c.name, c.kind, c.count])).toEqual([
      ['cal:1', 'Family', 'own', 1],
      ['calendar:aa11aa11aa', 'Work', 'feed', 2],
      ['calendar:bb22bb22bb', 'Holidays', 'feed', 0],
      ['health', 'Training & Health Data', 'app', 0],
      ['training', 'Training Plans', 'app', 1]
    ]);
    expect(list.filter((c) => c.problem).map((c) => c.key)).toEqual(['calendar:bb22bb22bb', 'health']);
  });

  it('wears the colour picked, and apps keep theirs', () => {
    expect(list.find((c) => c.key === 'cal:1')?.hue).toBe('violet');
    expect(list.find((c) => c.key === 'training')?.hue).toBe('orange');
    expect(list.find((c) => c.key === 'health')?.hue).toBe('aqua');
  });
});

describe('nextHue and links', () => {
  it('picks the first colour not taken', () => {
    expect(nextHue([])).toBe('blue');
    expect(nextHue(['blue', 'violet'])).toBe('aqua');
  });
  it('adds a link once and removes it', () => {
    const one = addItemTo(null, 'https://example.com/a.ics');
    expect(addItemTo(one, 'https://example.com/a.ics')).toBe(one);
    const two = addItemTo(one, 'https://example.com/b.ics');
    expect(removeItemFrom(two.split('\n'), 'https://example.com/a.ics')).toBe('https://example.com/b.ics');
  });
});

describe('hidden calendars', () => {
  it('reads only what can be a calendar', () => {
    expect(parseHidden('["health","calendar:aa11","DROP TABLE",3,"health"]')).toEqual(['health', 'calendar:aa11']);
    expect(parseHidden('nope')).toEqual([]);
    expect(parseHidden(null)).toEqual([]);
  });
  it('switches one off and on again', () => {
    const off = switchCalendar([], 'calendar:aa11', false)!;
    expect(off).toEqual(['calendar:aa11']);
    expect(switchCalendar(off, 'calendar:aa11', true)).toEqual([]);
    expect(switchCalendar(off, '../x', true)).toBeNull();
  });
});
