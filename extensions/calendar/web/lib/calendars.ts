/**
 * The calendars on the page, each with its colour and an on/off switch: the calendar's own entries, each
 * subscribed calendar on its own, and every other app that puts dates on it (whatever is installed, read
 * from what the shell hands out). Which ones a profile switched off is kept per profile. Pure.
 */
import type { SharedEntry } from '$shell';

export type CalendarKind = 'own' | 'feed' | 'app';

export interface CalendarItem {
  /** "calendar" (own entries), "calendar:<feed id>" (a subscription), or another app's id. */
  key: string;
  name: string;
  kind: CalendarKind;
  /** A shell categorical hue: blue, orange, aqua, ... (CSS var(--hue-<hue>)). */
  hue: string;
  /** Entries in the month on screen. */
  count: number;
  /** The app did not answer, or the subscription is not loading. */
  problem?: boolean;
}

export interface AppSource {
  extension: string;
  name: string;
  count: number;
  error?: string;
}

export interface FeedInfo {
  id: string;
  name: string;
  ok: boolean;
}

/** Every app keeps the colour it always had; the rest get the hues left over, in order. */
const FIXED: Record<string, string> = { calendar: 'blue', training: 'orange', gym: 'orange', health: 'aqua', home: 'violet' };
const HUES = ['blue', 'orange', 'aqua', 'violet', 'magenta', 'yellow', 'green', 'red'];

/** Which calendar an entry belongs to. */
export function calendarKey(e: Pick<SharedEntry, 'id' | 'source'>): string {
  if (e.source.extension !== 'calendar') return e.source.extension;
  const m = /^f:([0-9a-f]{1,20}):/.exec(e.id);
  return m ? `calendar:${m[1]}` : 'calendar';
}

/**
 * The list in the order shown: own entries, then the other apps by name, then the subscriptions in the
 * order they were added. `ownName` is "My entries" in the page's language.
 */
export function calendarsOf(sources: AppSource[], feeds: FeedInfo[], entries: Pick<SharedEntry, 'id' | 'source'>[], ownName: string): CalendarItem[] {
  const counts = new Map<string, number>();
  for (const e of entries) counts.set(calendarKey(e), (counts.get(calendarKey(e)) ?? 0) + 1);
  const count = (k: string) => counts.get(k) ?? 0;
  const own = sources.find((s) => s.extension === 'calendar');
  const apps = sources.filter((s) => s.extension !== 'calendar').sort((a, b) => a.name.localeCompare(b.name));

  const taken = new Set<string>(Object.values(FIXED));
  const spare = HUES.filter((h) => !taken.has(h));
  let next = 0;
  const pick = () => (spare.length ? spare[next++ % spare.length] : HUES[next++ % HUES.length]);
  // Apps without a fixed colour go first (sorted by id, so a new subscription never repaints an app).
  const appHue = new Map<string, string>();
  for (const s of [...apps].sort((a, b) => a.extension.localeCompare(b.extension))) appHue.set(s.extension, FIXED[s.extension] ?? pick());

  const list: CalendarItem[] = [];
  if (own) list.push({ key: 'calendar', name: ownName, kind: 'own', hue: FIXED.calendar, count: count('calendar'), ...(own.error ? { problem: true } : {}) });
  for (const s of apps)
    list.push({ key: s.extension, name: s.name, kind: 'app', hue: appHue.get(s.extension)!, count: s.error ? 0 : count(s.extension), ...(s.error ? { problem: true } : {}) });
  for (const f of feeds) {
    const key = `calendar:${f.id}`;
    list.push({ key, name: f.name, kind: 'feed', hue: pick(), count: count(key), ...(f.ok ? {} : { problem: true }) });
  }
  return list;
}

const KEY = /^[a-z0-9][a-z0-9_-]{0,40}(:[0-9a-f]{1,20})?$/;

/** The switched-off calendars as stored (a JSON list); anything odd is dropped. */
export function parseHidden(raw: string | null | undefined): string[] {
  try {
    const v: unknown = JSON.parse(raw ?? '[]');
    return Array.isArray(v) ? [...new Set(v.filter((k): k is string => typeof k === 'string' && KEY.test(k)))].slice(0, 100) : [];
  } catch {
    return [];
  }
}

/** The list after switching one calendar on or off; null for a key that cannot be a calendar. */
export function switchCalendar(hidden: string[], key: string, on: boolean): string[] | null {
  if (!KEY.test(key)) return null;
  const rest = hidden.filter((k) => k !== key);
  return on ? rest : [...rest, key].slice(-100);
}

/** Where a profile's switched-off calendars are kept (the calendar is shared, the choice is not). */
export const hiddenKey = (profileId: string) => `hidden:${profileId}`;
