/**
 * "Connected accounts" in this extension's System settings panel (spec 002): two cards whose settings are
 * typed right in them (`fields`):
 * - Home Assistant: address and token, the connection checked live, and what the board watches (set by
 *   Claude or Codex through home__configure).
 * - Calendars: subscription links (ICS / webcal), read-only and independent of Home Assistant, with each
 *   feed's name and what it has today.
 */
import type { ExtensionContext, ExtSources, SourceStatus } from '$shell';
import { HaError } from './lib/ha.server';
import { isContact, lightsOf, matches, parsePatterns } from './lib/home';
import { todayFromIcs, type IcsCalendar } from './lib/ics';
import { clientOf, configOf, feedName, feedsOf, loadFeed } from './lib/snapshot.server';

const n = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`;
const every = (s: number) => (s % 60 === 0 ? `${s / 60} min` : `${s} s`);
const reason = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Connect once: the version, the place, the zone and counts of what the board watches. Throws HaError. */
async function probe(ctx: ExtensionContext) {
  const client = await clientOf(ctx, 3000);
  if (!client) return null;
  const [cfg, states, conf] = await Promise.all([client.ha.config(), client.ha.states(), configOf(ctx)]);
  const cp = parsePatterns(conf.contacts);
  const ap = parsePatterns(conf.alerts);
  const calp = parsePatterns(conf.calendars);
  return {
    host: new URL(client.base).host,
    version: cfg.version ?? '',
    place: cfg.location_name ?? '',
    timezone: cfg.time_zone ?? null,
    lights: lightsOf(states, parsePatterns(conf.lights)).length,
    contacts: states.filter((s) => isContact(s, cp)).length,
    alerts: ap.length ? states.filter((s) => matches(s.entity_id, ap)).length : 0,
    calendars: states.filter((s) => s.entity_id.startsWith('calendar.') && (!calp.length || matches(s.entity_id, calp))).length,
    refresh: conf.refresh_seconds
  };
}

async function homeAssistantCard(ctx: ExtensionContext): Promise<SourceStatus> {
  const card: SourceStatus = { id: 'home-assistant', name: 'Home Assistant', state: 'not_connected', fields: ['url', 'token'] };
  let p: Awaited<ReturnType<typeof probe>>;
  try {
    p = await probe(ctx);
  } catch (e) {
    const auth = e instanceof HaError && e.kind === 'auth';
    return {
      ...card,
      state: auth ? 'reconnect' : 'not_connected',
      account: String((await ctx.settings.get('url')) ?? ''),
      help: auth
        ? 'Home Assistant rejected the token. Paste a new long-lived access token.'
        : `${reason(e)}. Check the address; the board keeps showing the weather meanwhile.`
    };
  }
  if (!p) {
    return { ...card, help: 'Paste the address of your Home Assistant and a long-lived access token (Home Assistant -> your profile -> Security).' };
  }
  return {
    ...card,
    state: 'connected',
    account: [p.place, p.host].filter(Boolean).join(' · '),
    facts: [
      { label: 'Version', value: p.version || '–' },
      { label: 'Lights watched', value: String(p.lights) },
      { label: 'Doors & windows', value: String(p.contacts) },
      { label: 'Alert sensors', value: String(p.alerts) },
      { label: 'HA calendars', value: String(p.calendars) },
      { label: 'Refresh', value: every(p.refresh) }
    ],
    actions: [{ id: 'check', label: 'Check connection', help: 'What the board watches is set by Claude or Codex: ask in the terminal.' }]
  };
}

/** The house's zone for "today": Home Assistant's when connected, else the server's. */
async function houseZone(ctx: ExtensionContext): Promise<string> {
  const client = await clientOf(ctx, 2500);
  const tz = client ? await client.ha.config().then((c) => c.time_zone, () => undefined) : undefined;
  return tz || Intl.DateTimeFormat().resolvedOptions().timeZone;
}

async function calendarsCard(ctx: ExtensionContext): Promise<SourceStatus> {
  const card: SourceStatus = { id: 'calendars', name: 'Calendars', state: 'not_connected', fields: ['calendar_links'] };
  const urls = await feedsOf(ctx);
  if (!urls.length) {
    return {
      ...card,
      help:
        'Paste subscription links (ICS or webcal), separated by spaces. Google: calendar settings -> "Secret address in ' +
        'iCal format". iCloud: share the calendar as a public calendar. Outlook: publish a calendar -> ICS.'
    };
  }
  const [tz, results] = await Promise.all([
    houseZone(ctx),
    Promise.allSettled(urls.map(async (u) => ({ u, cal: await loadFeed(u, 3000) })))
  ]);
  const ok: { u: string; cal: IcsCalendar }[] = [];
  const failed: string[] = [];
  for (const r of results) r.status === 'fulfilled' ? ok.push(r.value) : failed.push(reason(r.reason));
  return {
    ...card,
    state: ok.length ? 'connected' : 'reconnect',
    account: `${n(urls.length, 'link', 'links')}${failed.length ? `, ${failed.length} not loading` : ''}`,
    help: failed[0],
    facts: ok.slice(0, 6).map(({ u, cal }) => {
      const t = todayFromIcs(cal, '', tz).length;
      return { label: feedName(u, cal), value: t ? `${n(t, 'event', 'events')} today` : 'nothing today' };
    })
  };
}

export const sources: ExtSources = {
  async list(ctx) {
    return Promise.all([homeAssistantCard(ctx), calendarsCard(ctx)]);
  },

  async act(ctx, source, action) {
    if (action !== 'check' && action !== 'saved') throw new Error('Unknown action.');
    if (source === 'calendars') {
      const card = await calendarsCard(ctx);
      if (card.state !== 'connected') throw new Error(card.help ?? 'No calendar links yet.');
      return `Calendars: ${card.facts?.map((f) => `${f.label} (${f.value})`).join(', ')}.${card.help ? ` ${card.help}.` : ''}`;
    }
    const p = await probe(ctx);
    if (!p) return 'Saved. Add both the address and the token to connect.';
    return `Connected to Home Assistant${p.version ? ` ${p.version}` : ''}${p.place ? ` (${p.place})` : ''}: ${n(p.lights, 'light', 'lights')}, ${n(p.contacts, 'door or window', 'doors and windows')}.`;
  }
};
