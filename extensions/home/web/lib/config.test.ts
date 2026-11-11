import { describe, expect, it } from 'vitest';
import { applyChange, DEFAULT_CONFIG, readConfig } from './config';

describe('readConfig', () => {
  it('falls back to the defaults for nothing, junk or out-of-range values', () => {
    expect(readConfig(null)).toEqual(DEFAULT_CONFIG);
    expect(readConfig('not json')).toEqual(DEFAULT_CONFIG);
    expect(readConfig(JSON.stringify({ lights: 'light.a', refresh_seconds: 2, alert_minutes: 5 }))).toEqual({
      ...DEFAULT_CONFIG,
      lights: 'light.a',
      alert_minutes: 5
    });
  });
});

describe('applyChange', () => {
  it('takes lists or strings, normalizes and dedupes them', () => {
    const c = applyChange(DEFAULT_CONFIG, { lights: ['Light.Desk', 'light.desk', 'switch.lamp_*'], contacts: 'binary_sensor.a; binary_sensor.b' });
    expect(c.lights).toBe('light.desk, switch.lamp_*');
    expect(c.contacts).toBe('binary_sensor.a, binary_sensor.b');
  });
  it('clears a pattern back to the default with an empty value', () => {
    expect(applyChange({ ...DEFAULT_CONFIG, alerts: 'event.x' }, { alerts: [] }).alerts).toBe('');
  });
  it('refuses what it cannot take, with a message Claude can act on', () => {
    expect(() => applyChange(DEFAULT_CONFIG, { lights: ['light.(a)'] })).toThrow('not an entity id or pattern: light.(a)');
    expect(() => applyChange(DEFAULT_CONFIG, { refresh_seconds: 5 })).toThrow('refresh_seconds: 15 to 3600');
    expect(() => applyChange(DEFAULT_CONFIG, { nope: 1 })).toThrow('unknown setting: nope');
  });
});
