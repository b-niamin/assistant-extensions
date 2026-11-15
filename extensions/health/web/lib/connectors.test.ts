import { describe, expect, it } from 'vitest';
import { mergedWeights, providerSource, stepProblems, weightTile, writeLine } from './connectors';

describe('connectors', () => {
  it('checks workout steps before they are queued', () => {
    expect(stepProblems([{ kind: 'warmup', durationType: 'time', durationValue: 600 }, { kind: 'repeat', repeats: 5, steps: [{ kind: 'work', durationType: 'distance', durationValue: 100 }, { kind: 'recovery', durationType: 'lap' }] }])).toEqual([]);
    expect(stepProblems([])).toEqual(['steps: at least one step']);
    expect(stepProblems([{ kind: 'sprint' }]).join()).toMatch(/kind/);
    expect(stepProblems([{ kind: 'work', durationType: 'time' }]).join()).toMatch(/durationValue/);
    expect(stepProblems([{ kind: 'repeat', repeats: 2, steps: [{ kind: 'repeat', repeats: 2, steps: [{ kind: 'work' }] }] }]).join()).toMatch(/nested/);
  });
  it('prefers the scale over Garmin on the same day', () => {
    expect(mergedWeights([{ day: '2026-11-14', source: 'garmin', kg: 80.5 }, { day: '2026-11-14', source: 'withings', kg: 80.1 }, { day: '2026-11-13', source: 'garmin', kg: 80.9 }])).toEqual([
      { day: '2026-11-13', kg: 80.9, source: 'garmin' },
      { day: '2026-11-14', kg: 80.1, source: 'withings' }
    ]);
  });
  it('builds the weight tile with the change over 30 days', () => {
    const tile = weightTile([{ day: '2026-10-01', kg: 82, source: 'garmin' }, { day: '2026-10-20', kg: 81, source: 'withings' }, { day: '2026-11-15', kg: 80.2, source: 'withings' }]);
    expect(tile.kpis?.[0]).toMatchObject({ value: 80.2, delta: -0.8 });
    expect(weightTile([]).empty).toBeTruthy();
  });
  it('shows an API source as a card with its sign-in command until it is connected', () => {
    const off = providerSource('strava', { status: null, connectedAt: null, lastSyncAt: null, count: 0, first: null, pending: false }, 'piotr');
    expect(off).toMatchObject({ id: 'strava', state: 'not_connected', command: 'ext-run health connectors python -m sync connect strava --profile piotr' });
    const on = providerSource('withings', { status: 'connected', connectedAt: '2026-11-15T19:00:00Z', lastSyncAt: null, count: 3, first: '2026-01-02', pending: false, toGarmin: false }, 'piotr');
    expect(on.state).toBe('connected');
    expect(on.actions?.map((a) => a.id)).toEqual(['sync-now', 'garmin-on']);
  });
  it('says what a write did', () => {
    expect(writeLine({ target: 'strava', op: 'edit_activity', state: 'failed', error: 'HTTP 401: Authorization Error' })).toBe('Strava activity edited: failed (HTTP 401: Authorization Error)');
  });
});
