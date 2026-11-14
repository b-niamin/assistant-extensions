import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CalendarQuery, ExtensionContext, SharedEntry } from '$shell';
import { calendar } from '../calendar.server';
import { snapshot } from './snapshot.server';
import { sources } from '../sources.server';
import { tools } from '../tools.server';
import { EN } from '$shell';

/** `other`: entries another app (the calendar) puts on the shared calendar. */
function ctx(settings: Record<string, string | number | null>, token: string | null = 'secret-token', other: SharedEntry[] = []) {
  const kv = new Map<string, string>();
  const c = {
    kv,
    ctx: {
      t: EN,
      lang: 'en',
      settings: { all: async () => settings, get: async (n: string) => settings[n] ?? null },
      secrets: { get: async () => token },
      // The shell's shared calendar, as far as these tests need it: home's own entries, and the others.
      calendar: {
        entries: async (q: CalendarQuery) => {
          const range = { from: new Date(q.from), to: new Date(q.to), timeZone: 'Europe/Warsaw' };
          const sources = [{ extension: 'home', name: 'Home', count: 0 } as { extension: string; name: string; count: number; error?: 'error' }];
          let own: SharedEntry[] = [];
          try {
            own = (await calendar.entries(c.ctx, range)).map((e) => ({
              ...e,
              allDay: e.start.length === 10,
              start: e.start.length === 10 ? e.start : new Date(e.start).toISOString(),
              end: e.start.length === 10 ? e.end! : new Date(e.end!).toISOString(),
              source: { extension: 'home', name: 'Home' }
            }));
          } catch {
            sources[0].error = 'error';
          }
          if (other.length) sources.push({ extension: 'calendar', name: 'Calendar', count: other.length });
          return { entries: [...own, ...other], sources };
        }
      },
      kv: {
        all: async () => Object.fromEntries(kv),
        get: async (k: string) => kv.get(k) ?? null,
        set: async (k: string, v: string) => void kv.set(k, v),
        remove: async (k: string) => void kv.delete(k)
      }
    } as unknown as ExtensionContext
  };
  return c;
}

const hours = Array.from({ length: 48 }, (_, i) => new Date(Date.UTC(2026, 10, 11) + i * 3600_000).toISOString().slice(0, 16));
const FORECAST = {
  timezone: 'Europe/Warsaw',
  current: { time: '2026-11-11T17:45', temperature_2m: 6, weather_code: 63, wind_speed_10m: 10, precipitation: 1.3, is_day: 0 },
  hourly: { time: hours, temperature_2m: hours.map(() => 5), precipitation: hours.map(() => 0), weather_code: hours.map(() => 3) },
  daily: { time: ['2026-11-11'], sunrise: ['2026-11-11T06:58'], sunset: ['2026-11-11T15:59'] }
};

function fakeFetch(opts: { haDown?: boolean; badToken?: boolean; auth?: string[] } = {}) {
  return vi.fn(async (input: string | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const auth = (init?.headers as Record<string, string> | undefined)?.Authorization;
    if (url.host === 'ha.local:8123') {
      opts.auth?.push(auth ?? '');
      if (opts.haDown) throw new TypeError('fetch failed');
      if (opts.badToken) return new Response('', { status: 401 });
      if (url.pathname === '/api/config') return Response.json({ latitude: 52.23, longitude: 21.01, time_zone: 'Europe/Warsaw', location_name: 'Dom', version: '2026.11.1' });
      if (url.pathname === '/api/states')
        return Response.json([
          { entity_id: 'light.kitchen', state: 'on', attributes: { friendly_name: 'Kitchen' } },
          { entity_id: 'binary_sensor.door', state: 'off', attributes: { device_class: 'door' } }
        ]);
      if (url.pathname === '/api/calendars') return Response.json([{ entity_id: 'calendar.family', name: 'Family' }]);
      if (url.pathname === '/api/calendars/calendar.family') {
        const day = new Date(Date.parse(url.searchParams.get('start')!) + 3600_000).toISOString().slice(0, 10);
        return Response.json([{ summary: 'Dentist', start: { dateTime: `${day}T15:30:00+01:00` }, end: { dateTime: `${day}T16:00:00+01:00` } }]);
      }
    }
    if (url.host === 'api.open-meteo.com') {
      expect(url.searchParams.get('latitude')).toBe('52.23');
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
    const { ctx: c, kv } = ctx({ url: 'ha.local:8123/' });
    kv.set('config', JSON.stringify({ refresh_seconds: 30 }));
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
    // Another address than the other tests: their calendar is still in the 5-min cache.
    const { ctx: c } = ctx({ url: 'http://ha.local:8123/down', location: '52.23, 21.01' });
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

describe('connected account', () => {
  it('asks for the address and token until both are set', async () => {
    vi.stubGlobal('fetch', fakeFetch());
    const [s] = await sources.list(ctx({}, null).ctx);
    expect(s).toMatchObject({ id: 'home-assistant', state: 'not_connected', fields: ['url', 'token'] });
  });
  it('shows the house once connected, and says so after a save', async () => {
    vi.stubGlobal('fetch', fakeFetch());
    const c = ctx({ url: 'http://ha.local:8123' }).ctx;
    const [s] = await sources.list(c);
    expect(s.state).toBe('connected');
    expect(s.account).toBe('Dom · ha.local:8123');
    expect(s.facts?.find((f) => f.label === 'Lights watched')?.value).toBe('1');
    expect(await sources.act!(c, 'home-assistant', 'saved', {})).toBe('Connected to Home Assistant 2026.11.1 (Dom): 1 light, 1 door or window.');
  });
  it('asks for a new token when Home Assistant rejects it', async () => {
    vi.stubGlobal('fetch', fakeFetch({ badToken: true }));
    const [s] = await sources.list(ctx({ url: 'http://ha.local:8123' }).ctx);
    expect(s.state).toBe('reconnect');
  });
});

describe('tools', () => {
  const tool = (name: string) => tools.find((t) => t.name === name)!;
  it('lists entities and configures what the board watches', async () => {
    vi.stubGlobal('fetch', fakeFetch());
    const { ctx: c, kv } = ctx({ url: 'http://ha.local:8123' });
    const listed = (await tool('entities').run({ domain: 'light' }, c)) as { entities: { id: string; watched?: string }[] };
    expect(listed.entities).toEqual([{ id: 'light.kitchen', name: 'Kitchen', state: 'on', device_class: undefined, watched: 'light' }]);
    const res = (await tool('configure').run({ alerts: ['binary_sensor.*'], refresh_seconds: 30 }, c)) as { matched: Record<string, number> };
    expect(res.matched).toEqual({ alerts: 1 });
    expect(JSON.parse(kv.get('config')!)).toMatchObject({ alerts: 'binary_sensor.*', refresh_seconds: 30, lights: '' });
    await expect(tool('configure').run({ colour: 'red' }, c)).rejects.toThrow('unknown setting: colour');
  });
});

describe('the shared calendar on the board', () => {
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Warsaw' });
  const evening: SharedEntry = { id: 'e1', title: "Parents' evening", allDay: true, start: today, end: '9999-12-31', kind: 'School', source: { extension: 'calendar', name: 'Calendar' } };
  it('merges the other apps with Home Assistant calendars', async () => {
    vi.stubGlobal('fetch', fakeFetch());
    const s = await snapshot(ctx({ url: 'http://ha.local:8123' }, 'secret-token', [evening]).ctx);
    expect(s.calendar.events.map((e) => [e.title, e.calendar])).toEqual([
      ["Parents' evening", 'School'],
      ['Dentist', 'Family']
    ]);
  });
  it('works without Home Assistant', async () => {
    vi.stubGlobal('fetch', fakeFetch());
    const s = await snapshot(ctx({ location: '52.23, 21.01' }, null, [evening]).ctx);
    expect(s.calendar.configured).toBe(true);
    expect(s.calendar.events.map((e) => e.title)).toEqual(["Parents' evening"]);
  });
  it('asks for a calendar when there is none', async () => {
    vi.stubGlobal('fetch', fakeFetch());
    const s = await snapshot(ctx({ location: '52.23, 21.01' }, null).ctx);
    expect(s.calendar.configured).toBe(false);
  });
});
