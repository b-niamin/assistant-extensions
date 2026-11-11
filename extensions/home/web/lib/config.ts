/**
 * What the board watches: set by Claude or Codex through the `home__configure` tool (not a settings form),
 * kept as one JSON value in the extension's KV under "config". Pure: parse, validate, merge.
 */
import { parsePatterns } from './home';

export interface HomeConfig {
  /** Entity patterns (`light.*, switch.lamp_*`); empty = every light. */
  lights: string;
  /** Empty = every door, window, garage door and opening sensor. */
  contacts: string;
  /** Sensors that raise an alert (camera person, doorbell); empty = none. */
  alerts: string;
  /** How long an alert stays after the sensor goes quiet. */
  alert_minutes: number;
  /** Official weather warning entities in Home Assistant (Meteoalarm, ...). */
  weather_alerts: string;
  /** Calendar entities; empty = every calendar. */
  calendars: string;
  /** Seconds between automatic refreshes of the board. */
  refresh_seconds: number;
}

export const DEFAULT_CONFIG: HomeConfig = {
  lights: '',
  contacts: '',
  alerts: '',
  alert_minutes: 10,
  weather_alerts: '',
  calendars: '',
  refresh_seconds: 60
};

export const PATTERN_KEYS = ['lights', 'contacts', 'alerts', 'weather_alerts', 'calendars'] as const;

/** The stored value (or nothing) -> a full config; anything malformed falls back to the default. */
export function readConfig(raw: string | null | undefined): HomeConfig {
  let v: Record<string, unknown> = {};
  try {
    const parsed = raw ? JSON.parse(raw) : {};
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) v = parsed;
  } catch {
    /* default */
  }
  const out: HomeConfig = { ...DEFAULT_CONFIG };
  for (const k of PATTERN_KEYS) if (typeof v[k] === 'string') out[k] = v[k] as string;
  if (typeof v.alert_minutes === 'number' && v.alert_minutes >= 0 && v.alert_minutes <= 1440) out.alert_minutes = v.alert_minutes;
  if (typeof v.refresh_seconds === 'number' && v.refresh_seconds >= 15 && v.refresh_seconds <= 3600) out.refresh_seconds = v.refresh_seconds;
  return out;
}

/**
 * Apply a change from Claude: only known keys, patterns normalized ("light.a, light.b"), numbers in range.
 * Throws a readable Error for anything it cannot take, so Claude can correct itself.
 */
export function applyChange(current: HomeConfig, change: Record<string, unknown>): HomeConfig {
  const next: HomeConfig = { ...current };
  for (const [k, v] of Object.entries(change)) {
    if (v === undefined) continue;
    if ((PATTERN_KEYS as readonly string[]).includes(k)) {
      const list = Array.isArray(v) ? v : typeof v === 'string' ? v.split(/[\s,;]+/) : null;
      if (!list || list.some((p) => typeof p !== 'string')) throw new Error(`${k}: a list of entity ids or patterns`);
      const items = (list as string[]).map((p) => p.trim().toLowerCase()).filter(Boolean);
      const bad = items.filter((p) => parsePatterns(p).length === 0);
      if (bad.length) throw new Error(`${k}: not an entity id or pattern: ${bad.join(', ')} (use a-z, 0-9, _, . and *)`);
      next[k as (typeof PATTERN_KEYS)[number]] = [...new Set(items)].join(', ');
    } else if (k === 'alert_minutes') {
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0 || n > 1440) throw new Error('alert_minutes: 0 to 1440');
      next.alert_minutes = Math.round(n);
    } else if (k === 'refresh_seconds') {
      const n = Number(v);
      if (!Number.isFinite(n) || n < 15 || n > 3600) throw new Error('refresh_seconds: 15 to 3600');
      next.refresh_seconds = Math.round(n);
    } else {
      throw new Error(`unknown setting: ${k}`);
    }
  }
  return next;
}
