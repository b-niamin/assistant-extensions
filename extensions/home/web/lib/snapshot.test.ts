import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ExtensionContext } from '$shell';
import { snapshot } from './snapshot.server';
import { sources } from '../sources.server';
import { tools } from '../tools.server';
import { EN } from './i18n';

function ctx(settings: Record<string, string | number | null>, token: string | null = 'secret-token', links: string | null = null) {
  const kv = new Map<string, string>();
  return {
    kv,
    ctx: {
      t: EN,
      lang: 'en',
      settings: { all: async () => settings, get: async (n: string) => settings[n] ?? null },
      secrets: { get: async (name: string) => (name === 'calendar_links' ? links : token) },
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
        const day = url.searchParams.get('start')!.slice(0, 10);
        return Response.json([{ summary: 'Dentist', start: { dateTime: `${day}T15:30:00+01:00` }, end: { dateTime: `${day}T16:00:00+01:00` } }]);
      }
    }
    if (url.host === 'cal.example') {
      const day = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Warsaw' }).replace(/-/g, '');
      return new Response(`BEGIN:VCALENDAR\r\nX-WR-CALNAME:School\r\nBEGIN:VEVENT\r\nUID:1\r\nSUMMARY:Parents' evening\r\nDTSTART;VALUE=DATE:${day}\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n`);
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

describe('calendar subscriptions', () => {
  it('merges ICS feeds with Home Assistant calendars, and shows them in their own card', async () => {
    vi.stubGlobal('fetch', fakeFetch());
    const c = ctx({ url: 'http://ha.local:8123' }, 'secret-token', 'webcal://cal.example/school.ics').ctx;
    const s = await snapshot(c);
    expect(s.calendar.events.map((e) => [e.title, e.calendar])).toEqual([
      ["Parents' evening", 'School'],
      ['Dentist', 'Family']
    ]);
    const cards = await sources.list(c);
    expect(cards[1]).toMatchObject({ id: 'calendars', state: 'connected', fields: ['calendar_links'], facts: [{ label: 'School', value: '1 event today' }] });
  });
  it('works without Home Assistant', async () => {
    vi.stubGlobal('fetch', fakeFetch());
    const s = await snapshot(ctx({ location: '52.23, 21.01' }, null, 'https://cal.example/a.ics').ctx);
    expect(s.calendar.configured).toBe(true);
    expect(s.calendar.events.map((e) => e.title)).toEqual(["Parents' evening"]);
  });
});
