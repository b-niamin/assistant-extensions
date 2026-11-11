import { describe, expect, it } from 'vitest';
import { ago, beni, contactsLabel, countdown, lightsLabel } from './board';
import type { Snapshot } from './types';

const base = (home?: Partial<NonNullable<Snapshot['ha']['home']>>, extra: Partial<Snapshot> = {}): Snapshot => ({
  at: '2026-11-11T17:00:00Z',
  refreshSeconds: 60,
  timezone: 'Europe/Warsaw',
  ha: {
    configured: true,
    home: { lights: { active: [], total: 4, unknown: [] }, contacts: { active: [], total: 3, unknown: [] }, alerts: [], ...home }
  },
  weather: { configured: true, warnings: [] },
  calendar: { configured: true, events: [] },
  ...extra
});

describe('beni', () => {
  it('is calm by day and asleep at night when all is quiet', () => {
    expect(beni(base(), 15).mood).toBe('steady');
    expect(beni(base(), 2)).toEqual({ mood: 'asleep', line: 'All quiet. Lights off, everything closed.' });
  });
  it('perks up on an alert and names what is open', () => {
    expect(beni(base({ alerts: [{ id: 'a', name: 'Door camera', at: '', active: true }] }), 15).mood).toBe('charged');
    const open = base({ contacts: { active: [{ id: 'x', name: 'Balcony door' }], total: 3, unknown: [] } });
    expect(beni(open, 15).line).toBe('Balcony door is open.');
  });
  it('waits when nothing is set', () => {
    expect(beni(base(undefined, { ha: { configured: false }, weather: { configured: false, warnings: [] } }), 12).mood).toBe('idle');
  });
});

describe('labels', () => {
  it('reads groups', () => {
    expect(lightsLabel({ active: [], total: 3, unknown: [] })).toBe('all off');
    expect(lightsLabel({ active: [{ id: 'a', name: 'a' }], total: 3, unknown: [] })).toBe('1 on');
    expect(contactsLabel({ active: [], total: 0, unknown: [] })).toBe('no sensors');
    expect(contactsLabel(undefined)).toBe('–');
  });
  it('says how long ago', () => {
    const now = Date.parse('2026-11-11T17:00:00Z');
    expect(ago('2026-11-11T16:59:40Z', now)).toBe('now');
    expect(ago('2026-11-11T16:45:00Z', now)).toBe('15 min ago');
    expect(ago('2026-11-11T14:00:00Z', now)).toBe('3 h ago');
  });
  it('counts down to the next refresh', () => {
    expect(countdown(0, 60_000, 15_000)).toEqual({ progress: 0.25, left: 45 });
    expect(countdown(0, 60_000, 90_000)).toEqual({ progress: 1, left: 0 });
  });
});
