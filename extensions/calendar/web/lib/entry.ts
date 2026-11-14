/**
 * The calendar's own entries: checking what the page form or Claude sends, and the row <-> entry mapping.
 * Pure (no DB), shared by the page actions and the MCP tools.
 */
import { EN, instantIn, nextDay, type CalendarEntry, type Translate } from '$shell';

export interface EntryInput {
  title?: unknown;
  /** YYYY-MM-DD */
  date?: unknown;
  /** YYYY-MM-DD, inclusive; for an entry over several days. */
  end_date?: unknown;
  /** HH:MM in the owner's zone; left out = all day. */
  start_time?: unknown;
  end_time?: unknown;
  location?: unknown;
  note?: unknown;
}

/** What goes into calendar.entries. */
export interface EntryRow {
  title: string;
  all_day: boolean;
  start_at: Date | null;
  end_at: Date | null;
  start_day: string | null;
  end_day: string | null;
  location: string | null;
  note: string | null;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '');
const validDay = (v: string) => DAY.test(v) && new Date(`${v}T12:00:00Z`).toISOString().slice(0, 10) === v;
// eslint-disable-next-line no-control-regex
const oneLine = (v: unknown, max: number) => str(v).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);

/** A checked row, or the first problem in words for the owner. */
export function parseEntry(input: EntryInput, timeZone: string, t: Translate = EN): { row: EntryRow } | { error: string } {
  const title = oneLine(input.title, 200);
  if (!title) return { error: t('Give it a title.') };
  const date = str(input.date);
  if (!validDay(date)) return { error: t('The date must be YYYY-MM-DD.') };
  const endDate = str(input.end_date) || date;
  if (!validDay(endDate) || endDate < date) return { error: t('The end date must be the same day or later.') };
  if (Date.parse(endDate) - Date.parse(date) > 366 * 86_400_000) return { error: t('An entry can last at most a year.') };
  const startTime = str(input.start_time);
  const endTime = str(input.end_time);
  const location = oneLine(input.location, 200) || null;
  // eslint-disable-next-line no-control-regex
  const note = str(input.note).replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, ' ').slice(0, 1000) || null;
  if (!startTime) {
    if (endTime) return { error: t('Give a start time too, or leave both empty for all day.') };
    return { row: { title, all_day: true, start_at: null, end_at: null, start_day: date, end_day: nextDay(endDate), location, note } };
  }
  if (!TIME.test(startTime) || (endTime && !TIME.test(endTime))) return { error: t('Times are HH:MM, e.g. 18:30.') };
  const start = instantIn(date, startTime, timeZone);
  const end = endTime ? instantIn(endDate, endTime, timeZone) : endDate === date ? new Date(start.getTime() + 3600_000) : instantIn(endDate, startTime, timeZone);
  if (end < start) return { error: t('It must end after it starts.') };
  return { row: { title, all_day: false, start_at: start, end_at: end, start_day: null, end_day: null, location, note } };
}

export interface DbEntry {
  id: string | number | bigint;
  title: string;
  all_day: boolean;
  start_at: Date | null;
  end_at: Date | null;
  start_day: string | Date | null;
  end_day: string | Date | null;
  location: string | null;
  note: string | null;
}

const dayText = (v: string | Date | null) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v ?? '').slice(0, 10));

/** A row as a calendar entry (id "e<id>"), with a link to its day on the calendar page. */
export function toEntry(r: DbEntry, dayOf: (d: Date) => string): CalendarEntry {
  const base = {
    id: `e${r.id}`,
    title: r.title,
    ...(r.location ? { location: r.location } : {}),
    ...(r.note ? { note: r.note } : {})
  };
  if (r.all_day) {
    const start = dayText(r.start_day);
    return { ...base, start, end: dayText(r.end_day), href: `/calendar?d=${start}` };
  }
  const s = r.start_at as Date;
  return { ...base, start: s.toISOString(), end: (r.end_at ?? s).toISOString(), href: `/calendar?d=${dayOf(s)}` };
}

/** "e42" -> 42; null for anything else (an id of another source). */
export const ownId = (id: unknown): number | null => {
  const m = /^e(\d{1,15})$/.exec(str(id));
  return m ? Number(m[1]) : null;
};
