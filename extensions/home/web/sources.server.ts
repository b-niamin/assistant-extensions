/**
 * "Connected accounts" in this extension's System settings panel (spec 002): two cards whose settings are
 * typed right in them (`fields`):
 * - Home Assistant: address and token, the connection checked live, and what the board watches (set by
 *   Claude or Codex through home__configure).
 * - Calendars: subscription links (ICS / webcal), read-only and independent of Home Assistant, with each
 *   feed's name and what it has today.
 */
import type { ExtensionContext, ExtSources, SourceStatus, Translate } from '$shell';
import { HaError } from './lib/ha.server';
import { isContact, lightsOf, matches, parsePatterns } from './lib/home';
import { todayFromIcs, type IcsCalendar } from './lib/ics';
import { clientOf, configOf, feedName, feedsOf, loadFeed } from './lib/snapshot.server';

const every = (s: number, t: Translate) => (s % 60 === 0 ? t('{n} min', { n: s / 60 }) : t('{n} s', { n: s }));
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
  const t = ctx.t;
  const card: SourceStatus = { id: 'home-assistant', name: t('Home Assistant'), state: 'not_connected', fields: ['url', 'token'] };
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
        ? t('Home Assistant rejected the token. Paste a new long-lived access token.')
        : t('{error}. Check the address; the board keeps showing the weather meanwhile.', { error: reason(e) })
    };
  }
  if (!p) {
    return { ...card, help: t('Paste the address of your Home Assistant and a long-lived access token (Home Assistant -> your profile -> Security).') };
  }
  return {
    ...card,
    state: 'connected',
    account: [p.place, p.host].filter(Boolean).join(' · '),
    facts: [
      { label: t('Version'), value: p.version || '–' },
      { label: t('Lights watched'), value: String(p.lights) },
      { label: t('Doors & windows'), value: String(p.contacts) },
      { label: t('Alert sensors'), value: String(p.alerts) },
      { label: t('HA calendars'), value: String(p.calendars) },
      { label: t('Refresh'), value: every(p.refresh, t) }
    ],
    actions: [{ id: 'check', label: t('Check connection'), help: t('What the board watches is set by Claude or Codex: ask in the terminal.') }]
  };
}

/** The house's zone for "today": Home Assistant's when connected, else the server's. */
async function houseZone(ctx: ExtensionContext): Promise<string> {
  const client = await clientOf(ctx, 2500);
  const tz = client ? await client.ha.config().then((c) => c.time_zone, () => undefined) : undefined;
  return tz || Intl.DateTimeFormat().resolvedOptions().timeZone;
}

async function calendarsCard(ctx: ExtensionContext): Promise<SourceStatus> {
  const t = ctx.t;
  const card: SourceStatus = { id: 'calendars', name: t('Calendars'), state: 'not_connected', fields: ['calendar_links'] };
  const urls = await feedsOf(ctx);
  if (!urls.length) {
    return {
      ...card,
      help: t(
        'Paste subscription links (ICS or webcal), separated by spaces. Google: calendar settings -> "Secret address in iCal format". iCloud: share the calendar as a public calendar. Outlook: publish a calendar -> ICS.'
      )
    };
  }
  const [tz, results] = await Promise.all([
    houseZone(ctx),
    Promise.allSettled(urls.map(async (u) => ({ u, cal: await loadFeed(u, 3000, t) })))
  ]);
  const ok: { u: string; cal: IcsCalendar }[] = [];
  const failed: string[] = [];
  for (const r of results) r.status === 'fulfilled' ? ok.push(r.value) : failed.push(reason(r.reason));
  return {
    ...card,
    state: ok.length ? 'connected' : 'reconnect',
    account: t.n(urls.length, '{n} link', '{n} links') + (failed.length ? t(', {n} not loading', { n: failed.length }) : ''),
    help: failed[0],
    facts: ok.slice(0, 6).map(({ u, cal }) => {
      const k = todayFromIcs(cal, '', tz).length;
      return { label: feedName(u, cal), value: k ? t.n(k, '{n} event today', '{n} events today') : t('nothing today') };
    })
  };
}

export const sources: ExtSources = {
  async list(ctx) {
    return Promise.all([homeAssistantCard(ctx), calendarsCard(ctx)]);
  },

  async act(ctx, source, action) {
    const t = ctx.t;
    if (action !== 'check' && action !== 'saved') throw new Error(t('Unknown action.'));
    if (source === 'calendars') {
      const card = await calendarsCard(ctx);
      if (card.state !== 'connected') throw new Error(card.help ?? t('No calendar links yet.'));
      const list = card.facts?.map((f) => `${f.label} (${f.value})`).join(', ');
      return t('Calendars: {list}.', { list }) + (card.help ? ` ${card.help}.` : '');
    }
    const p = await probe(ctx);
    if (!p) return t('Saved. Add both the address and the token to connect.');
    const where = [p.version, p.place ? `(${p.place})` : ''].filter(Boolean).join(' ');
    return t('Connected to Home Assistant{where}: {lights}, {contacts}.', {
      where: where ? ` ${where}` : '',
      lights: t.n(p.lights, '{n} light', '{n} lights'),
      contacts: t.n(p.contacts, '{n} door or window', '{n} doors and windows')
    });
  }
};
