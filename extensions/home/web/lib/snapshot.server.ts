/**
 * One snapshot of the house for the board, the tile and Claude: Home Assistant states (fresh on every
 * call), weather (Open-Meteo, cached 15 min in the extension's KV so a restart or an outage still shows
 * the last forecast) and today on the shared calendar (core spec 002: the calendar app's entries and
 * subscriptions, workouts, Home Assistant's calendars through calendar.server.ts, ...). Each part fails on its own.
 */
import type { ExtensionContext, Translate } from '$shell';
import { boardEvents, sortEvents, todayBounds } from './calendar';
import { haClient, baseUrl, HaError, type HaClient } from './ha.server';
import { officialWarnings, parsePatterns, summarize, type HaState } from './home';
import { forecastWarnings, parseCoords, type Weather } from './weather';
import { forecast, geocode, type Place } from './weather.server';
import type { Snapshot } from './types';
import { readConfig, type HomeConfig } from './config';

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
const CONFIG_TTL = 3600_000;


type HaConfig = Awaited<ReturnType<HaClient['config']>>;
let configCache: { key: string; at: number; value: HaConfig } | null = null;

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
    // Home Assistant's zone, else the forecast's, else the server's (APP_TIMEZONE).
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
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

  const calendarPart = (async () => {
    // Without Home Assistant's zone, "today" follows the forecast's: wait for it.
    if (!config?.time_zone) await weatherPart;
    const { day, start, end } = todayBounds(out.timezone);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      // The tile has 2.5 s in all; the board can wait for a slow calendar.
      const r = await Promise.race([
        ctx.calendar.entries({ from: start, to: end }),
        new Promise<never>((_, reject) => (timer = setTimeout(() => reject(new Error(ctx.t('The calendar did not answer in time'))), opts.quick ? 1500 : 7000)))
      ]);
      out.calendar.configured = !!ha || r.sources.some((s) => s.extension !== 'home');
      out.calendar.events = sortEvents(boardEvents(r.entries, out.timezone, day, ctx.t));
      const failed = r.sources.filter((s) => s.error);
      if (failed.length && failed.length === r.sources.length && !out.calendar.events.length)
        out.calendar.error = out.ha.error ?? ctx.t('{name} did not answer', { name: failed[0].name });
    } catch (e) {
      out.calendar.configured = true;
      out.calendar.error = message(e, ctx.t);
    } finally {
      clearTimeout(timer);
    }
  })();

  await Promise.all([weatherPart, calendarPart]);
  return out;
}
