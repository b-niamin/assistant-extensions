/**
 * "Connected accounts" in this extension's System settings panel (spec 002): the Home Assistant it reads,
 * with its address and token typed right in the card (`fields`), the connection checked live, and a few
 * facts about what the board watches. What it watches is set by Claude or Codex (home__configure).
 */
import type { ExtensionContext, ExtSources, SourceStatus } from '$shell';
import { isContact, isLight, matches, parsePatterns } from './lib/home';
import { HaError } from './lib/ha.server';
import { clientOf, configOf } from './lib/snapshot.server';

const FIELDS = ['url', 'token'];

/** Connect once: the version, the place and counts of what the board watches. Throws HaError. */
async function probe(ctx: ExtensionContext) {
  const client = await clientOf(ctx, 3500);
  if (!client) return null;
  const [cfg, states, conf] = await Promise.all([client.ha.config(), client.ha.states(), configOf(ctx)]);
  const lp = parsePatterns(conf.lights);
  const cp = parsePatterns(conf.contacts);
  const ap = parsePatterns(conf.alerts);
  return {
    host: new URL(client.base).host,
    version: cfg.version ?? '',
    place: cfg.location_name ?? '',
    lights: states.filter((s) => isLight(s, lp)).length,
    contacts: states.filter((s) => isContact(s, cp)).length,
    alerts: ap.length ? states.filter((s) => matches(s.entity_id, ap)).length : 0,
    calendars: states.filter((s) => s.entity_id.startsWith('calendar.') && (!conf.calendars || matches(s.entity_id, parsePatterns(conf.calendars)))).length,
    refresh: conf.refresh_seconds
  };
}

const n = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`;
const every = (s: number) => (s % 60 === 0 ? `${s / 60} min` : `${s} s`);

export const sources: ExtSources = {
  async list(ctx) {
    const base: SourceStatus = { id: 'home-assistant', name: 'Home Assistant', state: 'not_connected', fields: FIELDS };
    let p: Awaited<ReturnType<typeof probe>>;
    try {
      p = await probe(ctx);
    } catch (e) {
      const auth = e instanceof HaError && e.kind === 'auth';
      return [
        {
          ...base,
          state: auth ? 'reconnect' : 'not_connected',
          account: String((await ctx.settings.get('url')) ?? ''),
          help: auth
            ? 'Home Assistant rejected the token. Paste a new long-lived access token.'
            : `${e instanceof Error ? e.message : 'Could not connect'}. Check the address; the board keeps showing the weather meanwhile.`
        }
      ];
    }
    if (!p) {
      return [
        {
          ...base,
          help: 'Paste the address of your Home Assistant and a long-lived access token (Home Assistant -> your profile -> Security).'
        }
      ];
    }
    return [
      {
        ...base,
        state: 'connected',
        account: [p.place, p.host].filter(Boolean).join(' · '),
        facts: [
          { label: 'Version', value: p.version || '–' },
          { label: 'Lights watched', value: String(p.lights) },
          { label: 'Doors & windows', value: String(p.contacts) },
          { label: 'Alert sensors', value: String(p.alerts) },
          { label: 'Calendars', value: String(p.calendars) },
          { label: 'Refresh', value: every(p.refresh) }
        ],
        actions: [{ id: 'check', label: 'Check connection', help: 'What the board watches is set by Claude or Codex: ask in the terminal.' }]
      }
    ];
  },

  async act(ctx, _source, action) {
    if (action !== 'check' && action !== 'saved') throw new Error('Unknown action.');
    const p = await probe(ctx);
    if (!p) return 'Saved. Add both the address and the token to connect.';
    return `Connected to Home Assistant${p.version ? ` ${p.version}` : ''}${p.place ? ` (${p.place})` : ''}: ${n(p.lights, 'light', 'lights')}, ${n(p.contacts, 'door or window', 'doors and windows')}.`;
  }
};
