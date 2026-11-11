/**
 * Today's events from Home Assistant calendars (GET /api/calendars/<entity>?start=&end=), in the house's
 * time zone. Pure: the fetch lives in ha.server.ts.
 */
import type { Translate } from '$shell';
import { EN } from './i18n';

export interface HaEvent {
  summary?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  location?: string;
}

export interface CalendarEvent {
  title: string;
  calendar: string;
  allDay: boolean;
  /** ISO with offset; for all-day events the day at 00:00 in the house's zone. */
  start: string;
  end: string;
  /** "All day" or "09:30–10:15" in the house's zone. */
  when: string;
  location?: string;
}

/** Offset of a time zone at an instant, in minutes (Europe/Warsaw in November: 60). */
export function offsetMinutes(tz: string, at: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const local = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return Math.round((local - Math.floor(at.getTime() / 1000) * 1000) / 60_000);
}

/** The local day in a zone, "2026-11-11". */
export const localDay = (tz: string, at: Date) => at.toLocaleDateString('sv-SE', { timeZone: tz });

const fmtOffset = (m: number) => {
  const s = m < 0 ? '-' : '+';
  const a = Math.abs(m);
  return `${s}${String(Math.floor(a / 60)).padStart(2, '0')}:${String(a % 60).padStart(2, '0')}`;
};

/** Start and end of today in the zone, as ISO strings with that zone's offset. */
export function todayBounds(tz: string, now = new Date()): { day: string; start: string; end: string } {
  const day = localDay(tz, now);
  const startGuess = new Date(`${day}T00:00:00Z`);
  const off = offsetMinutes(tz, new Date(startGuess.getTime() - offsetMinutes(tz, now) * 60_000));
  const next = new Date(startGuess.getTime() + 86_400_000).toISOString().slice(0, 10);
  const offNext = offsetMinutes(tz, new Date(new Date(`${next}T00:00:00Z`).getTime() - off * 60_000));
  return { day, start: `${day}T00:00:00${fmtOffset(off)}`, end: `${next}T00:00:00${fmtOffset(offNext)}` };
}

const clock = (iso: string, tz: string) =>
  new Date(iso).toLocaleTimeString('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

export function normalizeEvents(events: HaEvent[], calendar: string, tz: string, day: string, t: Translate = EN): CalendarEvent[] {
  const out: CalendarEvent[] = [];
  for (const e of events) {
    const title = (e.summary ?? '').trim() || t('(no title)');
    if (e.start?.date) {
      const endDay = e.end?.date ?? e.start.date;
      // All-day events end the day after (exclusive); keep those that cover today.
      if (!(e.start.date <= day && endDay > day)) continue;
      out.push({ title, calendar, allDay: true, start: `${day}T00:00:00`, end: `${day}T23:59:59`, when: t('All day'), location: e.location });
    } else if (e.start?.dateTime) {
      const start = e.start.dateTime;
      const end = e.end?.dateTime ?? start;
      if (!Number.isFinite(Date.parse(start))) continue;
      const startsToday = localDay(tz, new Date(start)) === day;
      const when = startsToday ? `${clock(start, tz)}–${clock(end, tz)}` : t('until {time}', { time: clock(end, tz) });
      out.push({ title, calendar, allDay: false, start, end, when, location: e.location || undefined });
    }
  }
  return out;
}

export function sortEvents(events: CalendarEvent[]): CalendarEvent[] {
  return [...events].sort(
    (a, b) => Number(b.allDay) - Number(a.allDay) || Date.parse(a.start) - Date.parse(b.start) || a.title.localeCompare(b.title)
  );
}
