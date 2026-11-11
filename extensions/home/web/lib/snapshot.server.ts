/**
 * One snapshot of the house for the board, the tile and Claude: Home Assistant states (fresh on every
 * call), weather (Open-Meteo, cached 15 min in the extension's KV so a restart or an outage still shows
 * the last forecast) and today's calendar (cached 5 min in memory). Each part fails on its own.
 */
import type { ExtensionContext, Translate } from '$shell';
import { normalizeEvents, sortEvents, todayBounds, type CalendarEvent } from './calendar';
import { haClient, baseUrl, HaError, type HaClient } from './ha.server';
import { officialWarnings, parsePatterns, matches, summarize, type HaState } from './home';
import { forecastWarnings, parseCoords, type Weather } from './weather';
import { forecast, geocode, type Place } from './weather.server';
import type { Snapshot } from './types';
import { readConfig, type HomeConfig } from './config';
import { feedUrls, parseIcs, todayFromIcs, type IcsCalendar } from './ics';
import { EN } from './i18n';

export type { Snapshot };

/** What the board watches, as Claude last set it (home__configure). */
export const configOf = async (ctx: ExtensionContext): Promise<HomeConfig> => readConfig(await ctx.kv.get('config'));

/** The Home Assistant client from the settings (address) and secrets (token), or null when not set. */
export async function clientOf(ctx: ExtensionContext, timeoutMs = 6000): Promise<{ ha: HaClient; base: string } | null> {
  const base = baseUrl(await ctx.settings.get('url'));
  const token = await ctx.secrets.get('token');
  return base && token ? { ha: haClient(base, token, timeoutMs), base } : null;
}

const WEATHER_TTL = 15 * 60_000;
const WEATHER_MAX_AGE = 6 * 3600_000;
const CALENDAR_TTL = 5 * 60_000;
const CONFIG_TTL = 3600_000;


type HaConfig = Awaited<ReturnType<HaClient['config']>>;
let configCache: { key: string; at: number; value: HaConfig } | null = null;
let calendarCache: { key: string; at: number; events: CalendarEvent[] } | null = null;

/** Error text in the page's language: fixed messages are translated, the rest (from outside) stays as it is. */
const message = (e: unknown, t: Translate) => (e instanceof HaError || e instanceof Error ? t(e.message) : t('Something went wrong'));

async function haConfig(ha: HaClient, key: string): Promise<HaConfig | null> {
  if (configCache && configCache.key === key && Date.now() - configCache.at < CONFIG_TTL) return configCache.value;
  try {
    const value = await ha.config();
    configCache = { key, at: Date.now(), value };
    return value;
  } catch {
    return configCache?.key === key ? configCache.value : null;
  }
}

async function resolvePlace(ctx: ExtensionContext, location: unknown, config: HaConfig | null): Promise<Place | null> {
  const text = typeof location === 'string' ? location.trim() : '';
  const coords = parseCoords(text);
  if (coords) return { ...coords, name: text };
  if (text) {
    const key = `geo:${text.toLowerCase()}`;
    const cached = await ctx.kv.get(key);
    if (cached) return JSON.parse(cached) as Place;
    const p = await geocode(text);
    if (p) await ctx.kv.set(key, JSON.stringify(p));
    return p;
  }
  if (config && typeof config.latitude === 'number' && typeof config.longitude === 'number') {
    return { lat: config.latitude, lon: config.longitude, name: config.location_name || ctx.t('Home') };
  }
  return null;
}

async function weatherFor(ctx: ExtensionContext, place: Place, cacheOnly: boolean): Promise<{ data: Weather; stale: boolean }> {
  const key = `${place.lat.toFixed(3)},${place.lon.toFixed(3)}`;
  const raw = await ctx.kv.get('weather');
  const cached = raw ? (JSON.parse(raw) as { key: string; data: Weather }) : null;
  const age = cached?.key === key ? Date.now() - Date.parse(cached.data.at) : Infinity;
  if (cached && age < WEATHER_TTL) return { data: cached.data, stale: false };
  if (!cacheOnly) {
    try {
      const data = await forecast(place);
      await ctx.kv.set('weather', JSON.stringify({ key, data }));
      return { data, stale: false };
    } catch (e) {
      if (!cached || age > WEATHER_MAX_AGE) throw e;
    }
  }
  if (cached && age < WEATHER_MAX_AGE) return { data: cached.data, stale: true };
  throw new Error(ctx.t('No forecast yet'));
}

async function todaysEvents(ha: HaClient, patterns: RegExp[], tz: string, key: string, t: Translate): Promise<CalendarEvent[]> {
  const { day, start, end } = todayBounds(tz);
  const cacheKey = `${key}|${day}|${t.lang}|${patterns.map(String).join(',')}`;
  if (calendarCache && calendarCache.key === cacheKey && Date.now() - calendarCache.at < CALENDAR_TTL) return calendarCache.events;
  const cals = (await ha.calendars()).filter((c) => !patterns.length || matches(c.entity_id, patterns));
  const lists = await Promise.all(
    cals.map(async (c) => normalizeEvents(await ha.events(c.entity_id, start, end), c.name ?? c.entity_id, tz, day, t))
  );
  const events = sortEvents(lists.flat());
  calendarCache = { key: cacheKey, at: Date.now(), events };
  return events;
}

const FEED_TTL = 10 * 60_000;
const FEED_MAX_BYTES = 5_000_000;
// In two parts: `ext check`'s text scan would take a star-slash-star as the start of a comment.
const FEED_ACCEPT = 'text/calendar, text/plain, */' + '*';
/** A feed problem already worded for the owner (not wrapped again). */
class FeedError extends Error {}
const feedCache = new Map<string, { at: number; cal: IcsCalendar }>();

/** The calendar subscription links (System settings -> Home -> Calendars); a secret, as such links grant access. */
export const feedsOf = async (ctx: ExtensionContext) => feedUrls(await ctx.secrets.get('calendar_links'));

/** One ICS feed, cached 10 min (and served stale when the next fetch fails). */
export async function loadFeed(url: string, timeoutMs = 8000, t: Translate = EN): Promise<IcsCalendar> {
  const hit = feedCache.get(url);
  if (hit && Date.now() - hit.at < FEED_TTL) return hit.cal;
  const host = new URL(url).host;
  try {
    const res = await fetch(url, { headers: { Accept: FEED_ACCEPT }, signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) throw new FeedError(t('Calendar at {host} answered {status}', { host, status: res.status }));
    const text = await res.text();
    if (text.length > FEED_MAX_BYTES) throw new FeedError(t('Calendar at {host} is too large', { host }));
    if (!text.includes('BEGIN:VCALENDAR')) throw new FeedError(t('Calendar at {host} is not a calendar', { host }));
    const cal = parseIcs(text);
    feedCache.set(url, { at: Date.now(), cal });
    return cal;
  } catch (e) {
    if (hit) return hit.cal;
    if (e instanceof FeedError) throw e;
    if (e instanceof Error && e.name === 'TimeoutError') throw new Error(t('Calendar at {host} did not answer in time', { host }));
    throw new Error(t('Calendar at {host} failed: {error}', { host, error: e instanceof Error ? e.message : String(e) }));
  }
}

/** A feed's name: its own (X-WR-CALNAME), else the host. */
export const feedName = (url: string, cal: IcsCalendar) => cal.name ?? new URL(url).host;

export interface SnapshotOptions {
  /** Tiles have 2.5 s: short HA timeout, weather from the cache only when it has one. */
  quick?: boolean;
}

export async function snapshot(ctx: ExtensionContext, opts: SnapshotOptions = {}): Promise<Snapshot> {
  const location = await ctx.settings.get('location');
  const conf = await configOf(ctx);
  const client = await clientOf(ctx, opts.quick ? 1800 : 6000);
  const ha = client?.ha ?? null;
  const haKey = client?.base ?? '';

  const out: Snapshot = {
    at: new Date().toISOString(),
    refreshSeconds: conf.refresh_seconds,
    timezone: 'UTC',
    ha: { configured: !!ha },
    weather: { configured: false, warnings: [] },
    calendar: { configured: !!ha, events: [] }
  };

  let states: HaState[] = [];
  let config: HaConfig | null = null;
  if (ha) {
    const [st, cfg] = await Promise.allSettled([ha.states(), haConfig(ha, haKey)]);
    if (st.status === 'fulfilled') {
      states = st.value;
      out.ha.home = summarize(states, { lights: conf.lights, contacts: conf.contacts, alerts: conf.alerts, alertMinutes: conf.alert_minutes });
    } else {
      out.ha.error = message(st.reason, ctx.t);
    }
    if (cfg.status === 'fulfilled') config = cfg.value;
  }
  if (config?.time_zone) out.timezone = config.time_zone;

  const weatherPart = (async () => {
    let place: Place | null;
    try {
      place = await resolvePlace(ctx, location, config);
    } catch (e) {
      out.weather.configured = true;
      out.weather.error = ctx.t('Could not find the place: {error}', { error: message(e, ctx.t) });
      return;
    }
    if (!place) return;
    out.weather.configured = true;
    try {
      const w = await weatherFor(ctx, place, !!opts.quick);
      out.weather.data = w.data;
      out.weather.stale = w.stale || undefined;
      if (!config?.time_zone) out.timezone = w.data.timezone;
      out.weather.warnings = [...officialWarnings(states, parsePatterns(conf.weather_alerts)), ...forecastWarnings(w.data, ctx.t)];
    } catch (e) {
      out.weather.error = message(e, ctx.t);
      out.weather.warnings = officialWarnings(states, parsePatterns(conf.weather_alerts));
    }
  })();

  const feeds = await feedsOf(ctx);
  out.calendar.configured = !!ha || feeds.length > 0;
  const calendarPart = (async () => {
    // Without Home Assistant's zone, "today" follows the forecast's: wait for it.
    if (!config?.time_zone) await weatherPart;
    const errors: string[] = [];
    const lists = await Promise.all([
      (async () => {
        if (!ha) return [];
        if (out.ha.error) {
          errors.push(out.ha.error);
          return [];
        }
        try {
          return await todaysEvents(ha, parsePatterns(conf.calendars), out.timezone, haKey, ctx.t);
        } catch (e) {
          errors.push(message(e, ctx.t));
          return [];
        }
      })(),
      ...feeds.map(async (url) => {
        try {
          const cal = await loadFeed(url, opts.quick ? 1800 : 8000, ctx.t);
          return todayFromIcs(cal, feedName(url, cal), out.timezone, undefined, ctx.t);
        } catch (e) {
          errors.push(message(e, ctx.t));
          return [];
        }
      })
    ]);
    out.calendar.events = sortEvents(lists.flat());
    const sources = (ha ? 1 : 0) + feeds.length;
    if (errors.length && errors.length >= sources) out.calendar.error = errors[0];
  })();

  await Promise.all([weatherPart, calendarPart]);
  return out;
}
