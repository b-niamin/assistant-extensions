import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ExtensionContext } from '$shell';
import { snapshot } from './snapshot.server';

function ctx(settings: Record<string, string | number | null>, token: string | null = 'secret-token') {
  const kv = new Map<string, string>();
  return {
    kv,
    ctx: {
      settings: { all: async () => settings, get: async (n: string) => settings[n] ?? null },
      secrets: { get: async () => token },
      kv: {
        all: async () => Object.fromEntries(kv),
        get: async (k: string) => kv.get(k) ?? null,
        set: async (k: string, v: string) => void kv.set(k, v),
        remove: async (k: string) => void kv.delete(k)
      }
    } as unknown as ExtensionContext
  };
}

const hours = Array.from({ length: 48 }, (_, i) => new Date(Date.UTC(2026, 10, 11) + i * 3600_000).toISOString().slice(0, 16));
const FORECAST = {
  timezone: 'Europe/Warsaw',
  current: { time: '2026-11-11T17:45', temperature_2m: 6, weather_code: 63, wind_speed_10m: 10, precipitation: 1.3, is_day: 0 },
  hourly: { time: hours, temperature_2m: hours.map(() => 5), precipitation: hours.map(() => 0), weather_code: hours.map(() => 3) },
  daily: { time: ['2026-11-11'], sunrise: ['2026-11-11T06:58'], sunset: ['2026-11-11T15:59'] }
};

function fakeFetch(opts: { haDown?: boolean; auth?: string[] } = {}) {
  return vi.fn(async (input: string | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const auth = (init?.headers as Record<string, string> | undefined)?.Authorization;
    if (url.host === 'ha.local:8123') {
      opts.auth?.push(auth ?? '');
      if (opts.haDown) throw new TypeError('fetch failed');
      if (url.pathname === '/api/config') return Response.json({ latitude: 52.23, longitude: 21.01, time_zone: 'Europe/Warsaw', location_name: 'Dom' });
      if (url.pathname === '/api/states')
        return Response.json([
          { entity_id: 'light.kitchen', state: 'on', attributes: { friendly_name: 'Kitchen' } },
          { entity_id: 'binary_sensor.door', state: 'off', attributes: { device_class: 'door' } }
        ]);
      if (url.pathname === '/api/calendars') return Response.json([{ entity_id: 'calendar.family', name: 'Family' }]);
      if (url.pathname === '/api/calendars/calendar.family') {
        const day = url.searchParams.get('start')!.slice(0, 10);
        return Response.json([{ summary: 'Dentist', start: { dateTime: `${day}T15:30:00+01:00` }, end: { dateTime: `${day}T16:00:00+01:00` } }]);
      }
    }
    if (url.host === 'api.open-meteo.com') {
      expect(url.searchParams.get('latitude')).toBe('52.2300');
      return Response.json(FORECAST);
    }
    return new Response('not found', { status: 404 });
  });
}

afterEach(() => vi.unstubAllGlobals());

describe('snapshot', () => {
  it('puts the house, the weather at the home zone and today together, with the token only in the header', async () => {
    const auth: string[] = [];
    vi.stubGlobal('fetch', fakeFetch({ auth }));
    const { ctx: c, kv } = ctx({ url: 'ha.local:8123/', refresh: '30 s' });
    const s = await snapshot(c);
    expect(s.refreshSeconds).toBe(30);
    expect(s.timezone).toBe('Europe/Warsaw');
    expect(s.ha.home?.lights.active.map((l) => l.name)).toEqual(['Kitchen']);
    expect(s.ha.home?.contacts.total).toBe(1);
    expect(s.weather.data?.place).toBe('Dom');
    expect(s.calendar.events.map((e) => e.title)).toEqual(['Dentist']);
    expect(auth.every((a) => a === 'Bearer secret-token')).toBe(true);
    expect(JSON.stringify(s)).not.toContain('secret-token');
    expect(kv.has('weather')).toBe(true);
  });

  it('keeps the weather when Home Assistant is down', async () => {
    vi.stubGlobal('fetch', fakeFetch({ haDown: true }));
    const { ctx: c } = ctx({ url: 'http://ha.local:8123', location: '52.23, 21.01' });
    const s = await snapshot(c);
    expect(s.ha.error).toBe('Home Assistant is unreachable');
    expect(s.calendar.error).toBe('Home Assistant is unreachable');
    expect(s.weather.data?.current.temp).toBe(6);
  });

  it('says what is missing when nothing is set', async () => {
    vi.stubGlobal('fetch', fakeFetch());
    const s = await snapshot(ctx({}, null).ctx);
    expect(s.ha.configured).toBe(false);
    expect(s.weather.configured).toBe(false);
  });
});
