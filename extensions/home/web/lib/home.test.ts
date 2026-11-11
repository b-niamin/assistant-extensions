import { describe, expect, it } from 'vitest';
import { alertsFrom, homeZone, isActive, officialWarnings, parsePatterns, summarize, type HaState } from './home';

const NOW = Date.parse('2026-11-11T17:00:00Z');
const s = (entity_id: string, state: string, attributes: Record<string, unknown> = {}, last_changed?: string): HaState => ({
  entity_id,
  state,
  attributes,
  last_changed
});

const STATES: HaState[] = [
  s('light.kitchen', 'on', { friendly_name: 'Kitchen' }, '2026-11-11T16:00:00Z'),
  s('light.hall', 'off', { friendly_name: 'Hall' }),
  s('light.downstairs', 'on', { friendly_name: 'Downstairs', entity_id: ['light.kitchen'] }),
  s('light.garden', 'unavailable'),
  s('binary_sensor.balcony_door', 'on', { device_class: 'door', friendly_name: 'Balcony door' }, '2026-11-11T16:50:00Z'),
  s('binary_sensor.bedroom_window', 'off', { device_class: 'window' }),
  s('binary_sensor.hall_motion', 'on', { device_class: 'motion' }),
  s('binary_sensor.front_person', 'off', { friendly_name: 'Front camera person' }, '2026-11-11T16:55:00Z'),
  s('binary_sensor.back_person', 'on', { friendly_name: 'Back camera person' }, '2026-11-11T16:59:00Z'),
  s('event.doorbell', '2026-11-11T16:30:00.000+00:00', { friendly_name: 'Doorbell' }),
  s('zone.home', 'zoning', { latitude: 52.23, longitude: 21.01, friendly_name: 'Home' })
];

describe('patterns', () => {
  it('splits on commas and spaces and turns * into a wildcard', () => {
    const p = parsePatterns('light.*_lamp, switch.tv  binary_sensor.x');
    expect(p.some((re) => re.test('light.desk_lamp'))).toBe(true);
    expect(p.some((re) => re.test('switch.tv'))).toBe(true);
    expect(p.some((re) => re.test('switch.tvx'))).toBe(false);
  });
  it('ignores junk', () => {
    expect(parsePatterns('(.*)')).toEqual([]);
    expect(parsePatterns(null)).toEqual([]);
  });
});

describe('summarize', () => {
  const h = summarize(STATES, { alerts: 'binary_sensor.*_person, event.doorbell', alertMinutes: 10 }, NOW);
  it('counts lights, skipping groups, and lists unknown ones apart', () => {
    expect(h.lights.total).toBe(3);
    expect(h.lights.active.map((l) => l.name)).toEqual(['Kitchen']);
    expect(h.lights.unknown.map((l) => l.id)).toEqual(['light.garden']);
  });
  it('finds open doors and windows by device class, not motion', () => {
    expect(h.contacts.total).toBe(2);
    expect(h.contacts.active).toEqual([{ id: 'binary_sensor.balcony_door', name: 'Balcony door', since: '2026-11-11T16:50:00Z' }]);
  });
  it('takes explicit patterns over defaults', () => {
    const only = summarize(STATES, { lights: 'light.hall', contacts: 'binary_sensor.bedroom_*' }, NOW);
    expect(only.lights.total).toBe(1);
    expect(only.lights.active).toEqual([]);
    expect(only.contacts.total).toBe(1);
  });
  it('raises alerts: on now first, then recent; old events drop out', () => {
    expect(h.alerts.map((a) => [a.name, a.active])).toEqual([
      ['Back camera person', true],
      ['Front camera person', false]
    ]);
  });
});

describe('alertsFrom', () => {
  it('keeps an event for the window after it fired', () => {
    const a = alertsFrom(STATES, parsePatterns('event.doorbell'), 45, NOW);
    expect(a).toHaveLength(1);
    expect(a[0].active).toBe(false);
  });
  it('says nothing without patterns', () => {
    expect(alertsFrom(STATES, [], 10, NOW)).toEqual([]);
  });
});

describe('isActive', () => {
  it('reads covers and locks', () => {
    expect(isActive(s('cover.garage', 'open'))).toBe(true);
    expect(isActive(s('cover.garage', 'closed'))).toBe(false);
    expect(isActive(s('lock.front', 'unlocked'))).toBe(true);
    expect(isActive(s('lock.front', 'locked'))).toBe(false);
  });
});

describe('homeZone and official warnings', () => {
  it('reads the home zone', () => {
    expect(homeZone(STATES)).toEqual({ lat: 52.23, lon: 21.01, name: 'Home' });
  });
  it('turns a warning entity into a warning with a tone', () => {
    const w = officialWarnings(
      [s('binary_sensor.meteoalarm', 'on', { headline: 'Orange wind warning', awareness_level: '3; orange; Severe' }), s('binary_sensor.other', 'off')],
      parsePatterns('binary_sensor.*')
    );
    expect(w).toEqual([{ title: 'Orange wind warning', detail: undefined, tone: 'serious', source: 'official' }]);
  });
});
