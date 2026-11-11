/**
 * Pure logic over Home Assistant states (no network, no DOM): which lights are on, which doors and
 * windows are open, which alert sensors fired. The shapes follow GET /api/states.
 */

export interface HaState {
  entity_id: string;
  state: string;
  attributes?: Record<string, unknown>;
  last_changed?: string;
  last_updated?: string;
}

export interface Item {
  id: string;
  name: string;
  /** When the entity last changed state (ISO), e.g. how long a window has been open. */
  since?: string;
}

export interface Group {
  /** Entities that need attention: lights on, contacts open. */
  active: Item[];
  /** How many entities are watched. */
  total: number;
  /** Watched entities whose state is unknown or unavailable. */
  unknown: Item[];
}

export interface Alert {
  id: string;
  name: string;
  /** When it fired (ISO). */
  at: string;
  /** Still on right now (a sensor), or only recent (an event, or a sensor that went quiet). */
  active: boolean;
}

export interface HomeState {
  lights: Group;
  contacts: Group;
  alerts: Alert[];
}

const UNKNOWN = new Set(['unknown', 'unavailable', '']);
const CONTACT_CLASSES = new Set(['door', 'window', 'garage_door', 'opening']);

/** "light.*, switch.lamp_*" -> patterns; empty -> []. */
export function parsePatterns(v: unknown): RegExp[] {
  if (typeof v !== 'string') return [];
  return v
    .split(/[\s,;]+/)
    .map((p) => p.trim().toLowerCase())
    .filter((p) => /^[a-z0-9_.*]+$/.test(p))
    .map((p) => new RegExp('^' + p.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$'));
}

export const matches = (id: string, patterns: RegExp[]) => patterns.some((re) => re.test(id));

export const domainOf = (id: string) => id.slice(0, id.indexOf('.'));

export function nameOf(s: HaState): string {
  const n = s.attributes?.friendly_name;
  if (typeof n === 'string' && n.trim()) return n.trim();
  return s.entity_id.slice(s.entity_id.indexOf('.') + 1).replace(/_/g, ' ');
}

/** A light group lists its members in attributes.entity_id: counting it too would count a lamp twice. */
const isGroup = (s: HaState) => Array.isArray(s.attributes?.entity_id);

export function isLight(s: HaState, patterns: RegExp[]): boolean {
  if (patterns.length) return matches(s.entity_id, patterns);
  return domainOf(s.entity_id) === 'light' && !isGroup(s);
}

export function isContact(s: HaState, patterns: RegExp[]): boolean {
  if (patterns.length) return matches(s.entity_id, patterns);
  return domainOf(s.entity_id) === 'binary_sensor' && CONTACT_CLASSES.has(String(s.attributes?.device_class ?? ''));
}

/** "On" for a light or switch; "open" for a contact sensor, a cover or a lock (unlocked). */
export function isActive(s: HaState): boolean {
  const st = s.state.toLowerCase();
  switch (domainOf(s.entity_id)) {
    case 'cover':
    case 'valve':
      return st === 'open' || st === 'opening' || st === 'closing';
    case 'lock':
      return st === 'unlocked' || st === 'open' || st === 'opening';
    default:
      return st === 'on' || st === 'open';
  }
}

function group(states: HaState[]): Group {
  const g: Group = { active: [], total: states.length, unknown: [] };
  for (const s of states) {
    const item = { id: s.entity_id, name: nameOf(s), since: s.last_changed };
    if (UNKNOWN.has(s.state.toLowerCase())) g.unknown.push(item);
    else if (isActive(s)) g.active.push(item);
  }
  g.active.sort((a, b) => a.name.localeCompare(b.name));
  return g;
}

const time = (v: string | undefined) => (v ? Date.parse(v) : NaN);

/**
 * Alerts from the sensors the owner listed. A binary sensor alerts while on and for `keepMinutes` after it
 * went quiet; an event entity (doorbell, camera person) alerts for `keepMinutes` after it fired (its state
 * is the time of the last event).
 */
export function alertsFrom(states: HaState[], patterns: RegExp[], keepMinutes: number, now: number): Alert[] {
  if (!patterns.length) return [];
  const keep = Math.max(0, keepMinutes) * 60_000;
  const out: Alert[] = [];
  for (const s of states) {
    if (!matches(s.entity_id, patterns)) continue;
    const st = s.state.toLowerCase();
    if (UNKNOWN.has(st)) continue;
    if (domainOf(s.entity_id) === 'event') {
      const at = time(s.state);
      if (Number.isFinite(at) && now - at <= keep && at <= now + 60_000) {
        out.push({ id: s.entity_id, name: nameOf(s), at: new Date(at).toISOString(), active: false });
      }
      continue;
    }
    const changed = time(s.last_changed);
    if (isActive(s)) {
      out.push({ id: s.entity_id, name: nameOf(s), at: s.last_changed ?? new Date(now).toISOString(), active: true });
    } else if (Number.isFinite(changed) && now - changed <= keep) {
      // It went quiet `changed` ago: it was on until then.
      out.push({ id: s.entity_id, name: nameOf(s), at: new Date(changed).toISOString(), active: false });
    }
  }
  return out.sort((a, b) => Number(b.active) - Number(a.active) || Date.parse(b.at) - Date.parse(a.at));
}

export interface HomeOptions {
  lights?: unknown;
  contacts?: unknown;
  alerts?: unknown;
  alertMinutes?: unknown;
}

export function summarize(states: HaState[], opts: HomeOptions, now = Date.now()): HomeState {
  const lp = parsePatterns(opts.lights);
  const cp = parsePatterns(opts.contacts);
  const minutes = Number(opts.alertMinutes);
  return {
    lights: group(states.filter((s) => isLight(s, lp))),
    contacts: group(states.filter((s) => isContact(s, cp))),
    alerts: alertsFrom(states, parsePatterns(opts.alerts), Number.isFinite(minutes) ? minutes : 10, now)
  };
}

/** Home Assistant's home zone, the default weather location. */
export function homeZone(states: HaState[]): { lat: number; lon: number; name: string } | null {
  const z = states.find((s) => s.entity_id === 'zone.home');
  const lat = Number(z?.attributes?.latitude);
  const lon = Number(z?.attributes?.longitude);
  if (!z || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { lat, lon, name: nameOf(z) };
}

export interface WeatherWarning {
  title: string;
  detail?: string;
  tone: 'warning' | 'serious' | 'critical';
  source: 'forecast' | 'official';
}

/** Official warnings from Home Assistant entities (Meteoalarm and similar): one per entity that is on. */
export function officialWarnings(states: HaState[], patterns: RegExp[]): WeatherWarning[] {
  if (!patterns.length) return [];
  const out: WeatherWarning[] = [];
  for (const s of states) {
    if (!matches(s.entity_id, patterns)) continue;
    const st = s.state.toLowerCase();
    if (UNKNOWN.has(st) || st === 'off' || st === '0' || st === 'none' || st === 'no warnings') continue;
    const a = s.attributes ?? {};
    const pick = (...keys: string[]) => {
      for (const k of keys) if (typeof a[k] === 'string' && (a[k] as string).trim()) return (a[k] as string).trim();
      return undefined;
    };
    const severity = String(a.severity ?? a.awareness_level ?? '').toLowerCase();
    const tone: WeatherWarning['tone'] = /extreme|red|4/.test(severity)
      ? 'critical'
      : /severe|orange|3/.test(severity)
        ? 'serious'
        : 'warning';
    out.push({
      title: pick('headline', 'event', 'title') ?? nameOf(s),
      detail: pick('description', 'instruction'),
      tone,
      source: 'official'
    });
  }
  return out;
}
