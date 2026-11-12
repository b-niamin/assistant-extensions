/**
 * Weather from Open-Meteo (free, no key), normalized, plus what the board says about it: the condition
 * for a WMO code, the next four periods, the summary rows and warnings derived from the forecast.
 * Pure: the fetch lives in weather.server.ts.
 */
import type { Translate } from '$shell';
import type { WeatherWarning } from './home';
import { EN } from '$shell';

export interface Hour {
  /** Local time at the place, "2026-11-11T18:00" (Open-Meteo with timezone=auto). */
  time: string;
  temp: number | null;
  precip: number | null;
  prob: number | null;
  code: number | null;
  wind: number | null;
  gusts: number | null;
  isDay: boolean;
}

export interface Weather {
  place: string;
  /** When it was fetched (ISO, UTC). */
  at: string;
  timezone: string;
  current: {
    time: string;
    temp: number | null;
    feels: number | null;
    code: number | null;
    wind: number | null;
    gusts: number | null;
    precip: number | null;
    isDay: boolean;
  };
  /** The next 24 hours, starting with the current hour. */
  hours: Hour[];
  sunrise: string | null;
  sunset: string | null;
}

export type Sky = 'clear' | 'partly' | 'cloudy' | 'fog' | 'drizzle' | 'rain' | 'sleet' | 'snow' | 'storm';

const CODES: Record<number, [string, Sky]> = {
  0: ['Clear', 'clear'],
  1: ['Mainly clear', 'partly'],
  2: ['Partly cloudy', 'partly'],
  3: ['Overcast', 'cloudy'],
  45: ['Fog', 'fog'],
  48: ['Rime fog', 'fog'],
  51: ['Light drizzle', 'drizzle'],
  53: ['Drizzle', 'drizzle'],
  55: ['Dense drizzle', 'drizzle'],
  56: ['Freezing drizzle', 'sleet'],
  57: ['Freezing drizzle', 'sleet'],
  61: ['Light rain', 'rain'],
  63: ['Rain', 'rain'],
  65: ['Heavy rain', 'rain'],
  66: ['Freezing rain', 'sleet'],
  67: ['Freezing rain', 'sleet'],
  71: ['Light snow', 'snow'],
  73: ['Snow', 'snow'],
  75: ['Heavy snow', 'snow'],
  77: ['Snow grains', 'snow'],
  80: ['Rain showers', 'rain'],
  81: ['Rain showers', 'rain'],
  82: ['Violent showers', 'rain'],
  85: ['Snow showers', 'snow'],
  86: ['Heavy snow showers', 'snow'],
  95: ['Thunderstorm', 'storm'],
  96: ['Thunderstorm, hail', 'storm'],
  99: ['Thunderstorm, hail', 'storm']
};

export function condition(code: number | null | undefined): { label: string; sky: Sky } {
  const c = code == null ? undefined : CODES[code];
  return c ? { label: c[0], sky: c[1] } : { label: '—', sky: 'cloudy' };
}

const n = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const at = (arr: unknown, i: number) => (Array.isArray(arr) ? arr[i] : undefined);

/** Open-Meteo's /v1/forecast answer -> Weather (next 24 h from the current hour). */
export function normalize(raw: Record<string, any>, place: string, fetchedAt = new Date()): Weather {
  const c = raw.current ?? {};
  const h = raw.hourly ?? {};
  const times: string[] = Array.isArray(h.time) ? h.time : [];
  const nowHour = typeof c.time === 'string' ? c.time.slice(0, 13) : '';
  let start = times.findIndex((t) => t.slice(0, 13) >= nowHour);
  if (start < 0) start = 0;
  const hours: Hour[] = [];
  for (let i = start; i < times.length && hours.length < 24; i++) {
    hours.push({
      time: times[i],
      temp: n(at(h.temperature_2m, i)),
      precip: n(at(h.precipitation, i)),
      prob: n(at(h.precipitation_probability, i)),
      code: n(at(h.weather_code, i)),
      wind: n(at(h.wind_speed_10m, i)),
      gusts: n(at(h.wind_gusts_10m, i)),
      isDay: at(h.is_day, i) !== 0
    });
  }
  const d = raw.daily ?? {};
  const today = nowHour.slice(0, 10);
  const di = Array.isArray(d.time) ? Math.max(0, d.time.indexOf(today)) : 0;
  return {
    place,
    at: fetchedAt.toISOString(),
    timezone: typeof raw.timezone === 'string' ? raw.timezone : 'UTC',
    current: {
      time: typeof c.time === 'string' ? c.time : (hours[0]?.time ?? ''),
      temp: n(c.temperature_2m),
      feels: n(c.apparent_temperature),
      code: n(c.weather_code),
      wind: n(c.wind_speed_10m),
      gusts: n(c.wind_gusts_10m),
      precip: n(c.precipitation),
      isDay: c.is_day !== 0
    },
    hours,
    sunrise: typeof at(d.sunrise, di) === 'string' ? at(d.sunrise, di) : null,
    sunset: typeof at(d.sunset, di) === 'string' ? at(d.sunset, di) : null
  };
}

/** "2026-11-11T18:00" -> "18:00" (the place's local time, as Open-Meteo gives it). */
export const hhmm = (t: string | null | undefined) => (t && t.length >= 16 ? t.slice(11, 16) : '');

const sum = (xs: (number | null)[]) => xs.reduce<number>((a, b) => a + (b ?? 0), 0);
const round1 = (v: number) => Math.round(v * 10) / 10;

export interface Period {
  time: string;
  temp: number | null;
  code: number | null;
  isDay: boolean;
  /** Precipitation over the period, mm. */
  precip: number;
}

/** The next four 6-hour periods after the current one: a glance at tonight and tomorrow. */
export function periods(hours: Hour[], count = 4, step = 6): Period[] {
  const out: Period[] = [];
  for (let i = 3; i < hours.length && out.length < count; i += step) {
    const h = hours[i];
    out.push({
      time: h.time,
      temp: h.temp,
      code: h.code,
      isDay: h.isDay,
      precip: round1(sum(hours.slice(i, i + step).map((x) => x.precip)))
    });
  }
  return out;
}

export interface Summary {
  /** Wettest hour of the next 24 h, or null when it stays dry. */
  heaviest: { mm: number; time: string } | null;
  rainTotal: number;
  wind: { min: number; max: number; gusts: number | null } | null;
  /** Lowest temperature between this evening (18:00) and tomorrow 08:00. */
  night: number | null;
  sunrise: string | null;
  sunset: string | null;
}

export function summary(w: Weather): Summary {
  let heaviest: Summary['heaviest'] = null;
  for (const h of w.hours) {
    if ((h.precip ?? 0) >= 0.1 && (!heaviest || (h.precip ?? 0) > heaviest.mm)) heaviest = { mm: h.precip!, time: h.time };
  }
  const winds = w.hours.map((h) => h.wind).filter((v): v is number => v !== null);
  const gusts = w.hours.map((h) => h.gusts).filter((v): v is number => v !== null);
  const nightTemps = w.hours
    .filter((h) => {
      const hour = Number(h.time.slice(11, 13));
      return hour >= 18 || hour < 8;
    })
    .map((h) => h.temp)
    .filter((v): v is number => v !== null);
  return {
    heaviest,
    rainTotal: round1(sum(w.hours.map((h) => h.precip))),
    wind: winds.length
      ? { min: Math.round(Math.min(...winds)), max: Math.round(Math.max(...winds)), gusts: gusts.length ? Math.round(Math.max(...gusts)) : null }
      : null,
    night: nightTemps.length ? Math.round(Math.min(...nightTemps)) : null,
    sunrise: w.sunrise,
    sunset: w.sunset
  };
}

/**
 * Warnings the forecast itself justifies (no official source needed): storms, freezing rain, heavy rain or
 * snow, strong gusts, frost and heat. Thresholds are roughly IMGW's first warning level.
 */
export function forecastWarnings(w: Weather, t: Translate = EN): WeatherWarning[] {
  const out: WeatherWarning[] = [];
  const hours = w.hours;
  const first = (pred: (h: Hour) => boolean) => hours.find(pred);

  const storm = first((h) => h.code !== null && h.code >= 95);
  if (storm) out.push({ title: t('Thunderstorms'), detail: t('from about {time}', { time: hhmm(storm.time) }), tone: 'serious', source: 'forecast' });

  const ice = first((h) => h.code !== null && [56, 57, 66, 67].includes(h.code));
  if (ice) out.push({ title: t('Freezing rain, icy roads'), detail: t('from about {time}', { time: hhmm(ice.time) }), tone: 'serious', source: 'forecast' });

  const gust = hours.reduce<Hour | null>((m, h) => ((h.gusts ?? 0) > (m?.gusts ?? 0) ? h : m), null);
  if (gust && (gust.gusts ?? 0) >= 70) {
    out.push({
      title: t('Strong wind'),
      detail: t('gusts up to {kmh} km/h around {time}', { kmh: Math.round(gust.gusts!), time: hhmm(gust.time) }),
      tone: gust.gusts! >= 90 ? 'serious' : 'warning',
      source: 'forecast'
    });
  }

  const total = sum(hours.map((h) => h.precip));
  const wettest = hours.reduce<Hour | null>((m, h) => ((h.precip ?? 0) > (m?.precip ?? 0) ? h : m), null);
  const snowy = hours.some((h) => condition(h.code).sky === 'snow');
  if (snowy && total >= 10) {
    out.push({ title: t('Heavy snow'), detail: t('about {mm} mm in 24 h', { mm: round1(total) }), tone: 'warning', source: 'forecast' });
  } else if (total >= 20 || (wettest?.precip ?? 0) >= 6) {
    out.push({
      title: t('Heavy rain'),
      detail: t('{mm} mm in 24 h, most around {time}', { mm: round1(total), time: hhmm(wettest?.time) }),
      tone: total >= 40 ? 'serious' : 'warning',
      source: 'forecast'
    });
  }

  const temps = hours.map((h) => h.temp).filter((v): v is number => v !== null);
  if (temps.length && Math.min(...temps) <= -15) {
    out.push({ title: t('Severe frost'), detail: t('down to {deg}°', { deg: Math.round(Math.min(...temps)) }), tone: 'warning', source: 'forecast' });
  }
  if (temps.length && Math.max(...temps) >= 30) {
    out.push({ title: t('Heat'), detail: t('up to {deg}°', { deg: Math.round(Math.max(...temps)) }), tone: 'warning', source: 'forecast' });
  }
  return out;
}

/** "Warszawa" or "52.23, 21.01" -> coordinates when it already is a pair, else null (needs geocoding). */
export function parseCoords(v: unknown): { lat: number; lon: number } | null {
  if (typeof v !== 'string') return null;
  const m = v.trim().match(/^(-?\d{1,2}(?:\.\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:\.\d+)?)$/);
  if (!m) return null;
  const lat = Number(m[1]);
  const lon = Number(m[2]);
  return Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? { lat, lon } : null;
}
