/**
 * Read-only Home Assistant REST client: /api/config, /api/states, /api/calendars. The token stays here,
 * on the server; nothing it returns carries it.
 */
import { allowedHaUrl } from './net';
import type { HaEvent } from './calendar';
import type { HaState } from './home';

export class HaError extends Error {
  constructor(
    message: string,
    readonly kind: 'auth' | 'unreachable' | 'bad-response'
  ) {
    super(message);
  }
}

export interface HaClient {
  config(): Promise<{ latitude?: number; longitude?: number; time_zone?: string; location_name?: string; version?: string }>;
  states(): Promise<HaState[]>;
  calendars(): Promise<{ entity_id: string; name?: string }[]>;
  events(entity: string, start: string, end: string): Promise<HaEvent[]>;
}

/** "homeassistant.local:8123/" -> "http://homeassistant.local:8123"; null when it is not an http(s) URL. */
export function baseUrl(v: unknown): string | null {
  if (typeof v !== 'string' || !v.trim()) return null;
  let s = v.trim();
  if (!/^https?:\/\//i.test(s)) s = `http://${s}`;
  try {
    const u = new URL(s);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return `${u.origin}${u.pathname.replace(/\/+$/, '')}`;
  } catch {
    return null;
  }
}

export function haClient(base: string, token: string, timeoutMs = 6000): HaClient {
  async function get<T>(path: string): Promise<T> {
    if (!allowedHaUrl(base)) throw new HaError('That address is one of the assistant\'s own services, not Home Assistant', 'unreachable');
    let res: Response;
    try {
      res = await fetch(`${base}${path}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(timeoutMs)
      });
    } catch (e) {
      const why = e instanceof Error && e.name === 'TimeoutError' ? 'did not answer in time' : 'is unreachable';
      throw new HaError(`Home Assistant ${why}`, 'unreachable');
    }
    if (res.status === 401 || res.status === 403) throw new HaError('Home Assistant rejected the token', 'auth');
    if (!res.ok) throw new HaError(`Home Assistant answered ${res.status}`, 'bad-response');
    try {
      return (await res.json()) as T;
    } catch {
      throw new HaError('Home Assistant sent something that is not JSON', 'bad-response');
    }
  }
  const q = encodeURIComponent;
  return {
    config: () => get('/api/config'),
    states: async () => {
      const s = await get<unknown>('/api/states');
      if (!Array.isArray(s)) throw new HaError('Home Assistant sent no states', 'bad-response');
      return s.filter((x): x is HaState => !!x && typeof x.entity_id === 'string' && typeof x.state === 'string');
    },
    calendars: async () => {
      const c = await get<unknown>('/api/calendars');
      return Array.isArray(c) ? c.filter((x) => x && typeof x.entity_id === 'string') : [];
    },
    events: async (entity, start, end) => {
      const e = await get<unknown>(`/api/calendars/${q(entity)}?start=${q(start)}&end=${q(end)}`);
      return Array.isArray(e) ? e : [];
    }
  };
}
