/**
 * Calendars, pure: Home Assistant's events (GET /api/calendars/<entity>?start=&end=) as entries of the
 * shared calendar (core spec 002), and today's entries of the shared calendar as the board shows them, in
 * the house's time zone. The fetches live in ha.server.ts and calendar.server.ts.
 */
import type { CalendarEntry, SharedEntry, Translate } from '$shell';
import { EN } from '$shell';

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

/** Home Assistant events of one calendar as shared-calendar entries (days stay days, times keep their offset). */
export function haEntries(events: HaEvent[], entity: string, name: string): CalendarEntry[] {
  const out: CalendarEntry[] = [];
  for (const e of events) {
    const title = (e.summary ?? '').trim() || '(no title)';
    const start = e.start?.date ?? e.start?.dateTime;
    if (!start) continue;
    const end = e.start?.date ? e.end?.date : e.end?.dateTime;
    out.push({
      id: `${entity}|${start}|${title}`.slice(0, 200),
      title,
      start,
      ...(end ? { end } : {}),
      kind: name.slice(0, 30),
      ...(e.location ? { location: e.location } : {}),
      href: '/home'
    });
  }
  return out;
}

/** Today's entries of the shared calendar as board events: "All day", "09:30–10:15" or "until 06:00". */
export function boardEvents(entries: SharedEntry[], tz: string, day: string, t: Translate = EN): CalendarEvent[] {
  const out: CalendarEvent[] = [];
  for (const e of entries) {
    const calendar = e.kind ?? e.source.name;
    const location = e.location || undefined;
    if (e.allDay) {
      if (!(e.start <= day && e.end > day)) continue;
      out.push({ title: e.title, calendar, allDay: true, start: `${day}T00:00:00`, end: `${day}T23:59:59`, when: t('All day'), location });
      continue;
    }
    const startDay = localDay(tz, new Date(e.start));
    const endDay = localDay(tz, new Date(Math.max(Date.parse(e.start), Date.parse(e.end) - 1)));
    if (startDay > day || endDay < day) continue;
    const when =
      startDay !== day
        ? endDay === day
          ? t('until {time}', { time: clock(e.end, tz) })
          : t('All day')
        : e.end === e.start
          ? clock(e.start, tz)
          : `${clock(e.start, tz)}–${clock(e.end, tz)}`;
    out.push({ title: e.title, calendar, allDay: false, start: e.start, end: e.end, when, location });
  }
  return out;
}

export function sortEvents(events: CalendarEvent[]): CalendarEvent[] {
  return [...events].sort(
    (a, b) => Number(b.allDay) - Number(a.allDay) || Date.parse(a.start) - Date.parse(b.start) || a.title.localeCompare(b.title)
  );
}
