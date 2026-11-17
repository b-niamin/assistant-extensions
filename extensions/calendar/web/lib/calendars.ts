/**
 * The calendars on the page, each with its colour and an on/off switch: the calendars added here (that keep
 * entries, or stand for a subscription link), and every other app that puts dates on the shared calendar
 * (whatever is installed, read from what the shell hands out). Which ones a profile switched off is kept
 * per profile. Pure.
 */
import type { SharedEntry } from '$shell';
import { feedUrls } from './ics';

export type CalendarKind = 'own' | 'feed' | 'app';
export const HUES = ['blue', 'violet', 'aqua', 'orange', 'magenta', 'yellow', 'green', 'red'] as const;
export type Hue = (typeof HUES)[number];
export const isHue = (v: unknown): v is Hue => HUES.includes(v as Hue);

export interface CalendarItem {
  /** "cal:<id>" (a calendar added here), "calendar:<feed id>" (its subscription's entries), or another app's id. */
  key: string;
  /** The row in calendar.calendars, for a calendar added here. */
  id?: number;
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

export interface CalRowLike {
  id: number;
  name: string;
  hue: string;
  feed_id: string | null;
}

export interface FeedInfo {
  id: string;
  ok: boolean;
}

/** Apps keep the colour they always had; calendars added here wear the one picked for them. */
const APP_HUES: Record<string, string> = { training: 'orange', gym: 'orange', health: 'aqua', home: 'violet' };

/** The colour for a new calendar: the first one not taken yet. */
export function nextHue(taken: string[]): Hue {
  return HUES.find((h) => !taken.includes(h)) ?? HUES[taken.length % HUES.length];
}

/** Which calendar an entry belongs to: an own entry names its calendar in its link (?cal=<id>). */
export function calendarKey(e: Pick<SharedEntry, 'id' | 'source' | 'href'>): string {
  if (e.source.extension !== 'calendar') return e.source.extension;
  const f = /^f:([0-9a-f]{1,20}):/.exec(e.id);
  if (f) return `calendar:${f[1]}`;
  const c = /[?&]cal=(\d{1,15})/.exec(e.href ?? '');
  return c ? `cal:${c[1]}` : 'calendar';
}

/** The key a calendar row answers to: its subscription's for a link, its own otherwise. */
export const rowKey = (r: Pick<CalRowLike, 'id' | 'feed_id'>) => (r.feed_id ? `calendar:${r.feed_id}` : `cal:${r.id}`);

/** The list in the order shown: calendars added here (in the order added), then the other apps by name. */
export function calendarsOf(rows: CalRowLike[], sources: AppSource[], feeds: FeedInfo[], entries: Pick<SharedEntry, 'id' | 'source' | 'href'>[]): CalendarItem[] {
  const counts = new Map<string, number>();
  for (const e of entries) counts.set(calendarKey(e), (counts.get(calendarKey(e)) ?? 0) + 1);
  const count = (k: string) => counts.get(k) ?? 0;
  const own = sources.find((s) => s.extension === 'calendar');
  const list: CalendarItem[] = rows.map((r) => {
    const key = rowKey(r);
    const feed = r.feed_id ? feeds.find((f) => f.id === r.feed_id) : null;
    const problem = r.feed_id ? !feed?.ok : !!own?.error;
    return { key, id: r.id, name: r.name, kind: r.feed_id ? 'feed' : 'own', hue: r.hue, count: count(key), ...(problem ? { problem: true } : {}) };
  });
  const taken = new Set(rows.map((r) => r.hue));
  const apps = sources.filter((s) => s.extension !== 'calendar').sort((a, b) => a.name.localeCompare(b.name));
  for (const s of apps) {
    const hue = APP_HUES[s.extension] ?? nextHue([...taken]);
    taken.add(hue);
    list.push({ key: s.extension, name: s.name, kind: 'app', hue, count: s.error ? 0 : count(s.extension), ...(s.error ? { problem: true } : {}) });
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

/** The stored list of links (one per line) with one more; at most 20. */
export function addItemTo(stored: string | null, url: string): string {
  const urls = feedUrls(stored);
  if (!urls.includes(url)) urls.push(url);
  if (urls.length > 20) throw new Error('Too many calendars (at most 20 links).');
  return urls.join('\n');
}

/** The list of links without one ('' when none is left). */
export const removeItemFrom = (urls: string[], url: string): string => urls.filter((u) => u !== url).join('\n');
