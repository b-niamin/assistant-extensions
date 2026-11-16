import { describe, expect, it } from 'vitest';
import { calendarKey, calendarsOf, parseHidden, switchCalendar } from './calendars';

const src = (extension: string, name = extension) => ({ id: 'x', source: { extension, name } });

describe('calendarKey', () => {
  it('splits the calendar into own entries and each subscription', () => {
    expect(calendarKey({ id: 'e12', source: { extension: 'calendar', name: 'Calendar' } })).toBe('calendar');
    expect(calendarKey({ id: 'f:ab12cd34ef:uid@x', source: { extension: 'calendar', name: 'Calendar' } })).toBe('calendar:ab12cd34ef');
    expect(calendarKey(src('training'))).toBe('training');
  });
});

describe('calendarsOf', () => {
  const sources = [
    { extension: 'calendar', name: 'Calendar', count: 3 },
    { extension: 'training', name: 'Training', count: 1 },
    { extension: 'health', name: 'Training & Health', count: 0, error: 'timeout' }
  ];
  const feeds = [
    { id: 'aa11', name: 'Family', ok: true },
    { id: 'bb22', name: 'calendar.google.com', ok: false }
  ];
  const entries = [
    { id: 'e1', source: { extension: 'calendar', name: 'Calendar' } },
    { id: 'f:aa11:1', source: { extension: 'calendar', name: 'Calendar' } },
    { id: 'f:aa11:2', source: { extension: 'calendar', name: 'Calendar' } },
    { id: 'w1', source: { extension: 'training', name: 'Training' } }
  ];
  const list = calendarsOf(sources, feeds, entries, 'My entries');

  it('lists own entries, the apps by name, then every subscription, even with nothing this month', () => {
    expect(list.map((c) => [c.key, c.name, c.count])).toEqual([
      ['calendar', 'My entries', 1],
      ['training', 'Training', 1],
      ['health', 'Training & Health', 0],
      ['calendar:aa11', 'Family', 2],
      ['calendar:bb22', 'calendar.google.com', 0]
    ]);
    expect(list.filter((c) => c.problem).map((c) => c.key)).toEqual(['health', 'calendar:bb22']);
  });

  it('gives each a different colour and keeps the fixed ones', () => {
    const hues = list.map((c) => c.hue);
    expect(new Set(hues).size).toBe(hues.length);
    expect(list.find((c) => c.key === 'calendar')?.hue).toBe('blue');
    expect(list.find((c) => c.key === 'health')?.hue).toBe('aqua');
  });

  it('a new subscription does not repaint an app', () => {
    const fewer = calendarsOf(sources, feeds.slice(0, 1), entries, 'My entries');
    expect(fewer.find((c) => c.key === 'training')?.hue).toBe(list.find((c) => c.key === 'training')?.hue);
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
