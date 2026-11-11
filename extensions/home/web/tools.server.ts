/**
 * Tools for the AI (spec 005 of the core), as `home__<tool>` on the assistant's MCP server. The board only reads Home Assistant and never switches anything;
 * the one write is `configure`: what the board watches. The address and token are set by the owner in
 * System settings, never here, and the token never leaves the server.
 */
import type { ExtTool } from '$shell';
import { applyChange, DEFAULT_CONFIG, PATTERN_KEYS } from './lib/config';
import { domainOf, isContact, lightsOf, matches, nameOf, parsePatterns } from './lib/home';
import { clientOf, configOf, snapshot } from './lib/snapshot.server';
import { summary } from './lib/weather';

const patternProp = (what: string) => ({
  description: `${what}. Entity ids or patterns with * (e.g. "light.*_lamp"), as a list or one comma separated string; "" or [] = the default.`,
  oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }]
});

export const tools: ExtTool[] = [
  {
    name: 'overview',
    title: 'The house now',
    readOnly: true,
    description:
      'The house right now, from Home Assistant: which lights are on, which doors and windows are open (with since ' +
      'when), active or recent alerts (cameras, doorbell), weather now and for the next 24 hours with warnings, ' +
      "today's calendar events, and what the board is configured to watch. Read-only.",
    input: { type: 'object', properties: {} },
    run: async (_args, ctx) => {
      const [s, config] = await Promise.all([snapshot(ctx), configOf(ctx)]);
      const w = s.weather.data;
      return {
        at: s.at,
        timezone: s.timezone,
        config,
        homeAssistant: s.ha.configured ? (s.ha.error ? { error: s.ha.error } : s.ha.home) : 'not connected (System settings -> Home)',
        weather: w
          ? { place: w.place, now: w.current, next24h: summary(w), hours: w.hours, warnings: s.weather.warnings, stale: !!s.weather.stale }
          : (s.weather.error ?? 'no location set'),
        today: s.calendar.error ? { error: s.calendar.error } : s.calendar.events
      };
    }
  },
  {
    name: 'entities',
    title: 'Home Assistant entities',
    readOnly: true,
    description:
      'Home Assistant entities to choose from when configuring the board: id, name, state, domain and device class. ' +
      'Filter by `domain` (light, switch, binary_sensor, event, calendar, cover, lock, sensor, ...) and/or `search` ' +
      '(matches id or name). Each row says whether the board watches it now (as a light, a door/window or an alert).',
    input: {
      type: 'object',
      properties: {
        domain: { type: 'string' },
        search: { type: 'string' },
        limit: { type: 'integer', minimum: 1, maximum: 500 }
      }
    },
    run: async (args, ctx) => {
      const client = await clientOf(ctx);
      if (!client) throw new Error('Home Assistant is not connected yet: the owner adds the address and token in System settings -> Home.');
      const [states, conf] = await Promise.all([client.ha.states(), configOf(ctx)]);
      const domain = typeof args.domain === 'string' ? args.domain.trim().toLowerCase() : '';
      const search = typeof args.search === 'string' ? args.search.trim().toLowerCase() : '';
      const limit = Math.min(500, Math.max(1, Number(args.limit) || 200));
      const lp = parsePatterns(conf.lights);
      const cp = parsePatterns(conf.contacts);
      const ap = parsePatterns(conf.alerts);
      const counted = new Set(lightsOf(states, lp).map((s) => s.entity_id));
      const rows = states
        .filter((s) => !domain || domainOf(s.entity_id) === domain)
        .filter((s) => !search || s.entity_id.includes(search) || nameOf(s).toLowerCase().includes(search))
        .map((s) => ({
          id: s.entity_id,
          name: nameOf(s),
          state: s.state,
          device_class: typeof s.attributes?.device_class === 'string' ? s.attributes.device_class : undefined,
          watched: counted.has(s.entity_id) ? 'light' : isContact(s, cp) ? 'door/window' : ap.length && matches(s.entity_id, ap) ? 'alert' : undefined
        }));
      return { total: rows.length, entities: rows.slice(0, limit) };
    }
  },
  {
    name: 'configure',
    title: 'Configure the board',
    readOnly: false,
    description:
      'Change what the board watches; only the keys you pass change. lights (default every light), contacts (default ' +
      'every door/window/garage_door/opening binary sensor), alerts (sensors that raise an alert while on or right after ' +
      'they fire, e.g. binary_sensor.*_person, event.doorbell; default none), alert_minutes (how long an alert stays, ' +
      'default 10), weather_alerts (official warning entities such as binary_sensor.meteoalarm), calendars (default every ' +
      'calendar), refresh_seconds (15-3600, default 60). Use `entities` first to find ids. Returns the new config and ' +
      'how many entities each pattern now matches.',
    input: {
      type: 'object',
      properties: {
        lights: patternProp('Lights (or switches) to count as lights'),
        contacts: patternProp('Doors and windows'),
        alerts: patternProp('Alert sensors'),
        weather_alerts: patternProp('Official weather warning entities'),
        calendars: patternProp('Calendar entities'),
        alert_minutes: { type: 'integer', minimum: 0, maximum: 1440 },
        refresh_seconds: { type: 'integer', minimum: 15, maximum: 3600 },
        reset: { type: 'boolean', description: 'Start from the defaults before applying the rest.' }
      }
    },
    run: async (args, ctx) => {
      const { reset, ...change } = args;
      const next = applyChange(reset === true ? DEFAULT_CONFIG : await configOf(ctx), change);
      await ctx.kv.set('config', JSON.stringify(next));
      let matched: Record<string, number> | string = 'Home Assistant not connected: counts unavailable';
      const client = await clientOf(ctx);
      if (client) {
        try {
          const states = await client.ha.states();
          matched = Object.fromEntries(
            PATTERN_KEYS.filter((k) => next[k]).map((k) => [k, states.filter((s) => matches(s.entity_id, parsePatterns(next[k]))).length])
          );
        } catch (e) {
          matched = `could not count: ${(e as Error).message}`;
        }
      }
      return { config: next, matched, note: 'The board picks this up on its next refresh.' };
    }
  }
];
