/** The calendar's own entries in calendar.entries (shared by every profile). */
import type { CalendarRange, Sql } from '$shell';
import type { DbEntry, EntryRow } from './entry';

/** Entries that overlap the range: timed ones by instant, all-day ones by the owner's days. */
export function entriesIn(sql: Sql, range: CalendarRange, days: { first: string; last: string }, limit = 2000) {
  return sql<DbEntry[]>`
    SELECT e.id, e.title, e.all_day, e.start_at, e.end_at, e.start_day::text AS start_day, e.end_day::text AS end_day, e.location, e.note, e.calendar_id::text AS calendar_id, c.name AS calendar_name
      FROM calendar.entries e LEFT JOIN calendar.calendars c ON c.id = e.calendar_id
     WHERE (NOT e.all_day AND e.start_at < ${range.to} AND (e.end_at > ${range.from} OR (e.end_at = e.start_at AND e.start_at >= ${range.from})))
        OR (e.all_day AND e.start_day <= ${days.last}::date AND e.end_day > ${days.first}::date)
     ORDER BY coalesce(e.start_day::timestamptz, e.start_at), e.id
     LIMIT ${limit}`;
}

/** Add an entry to a calendar that keeps entries (calendar.calendars without a link). */
export async function addEntry(sql: Sql, row: EntryRow, by: string, calendar: { id: number; name: string }): Promise<DbEntry> {
  const [r] = await sql<DbEntry[]>`
    INSERT INTO calendar.entries (title, all_day, start_at, end_at, start_day, end_day, location, note, created_by, calendar_id)
    VALUES (${row.title}, ${row.all_day}, ${row.start_at}, ${row.end_at}, ${row.start_day}, ${row.end_day}, ${row.location}, ${row.note}, ${by}, ${calendar.id})
    RETURNING id, title, all_day, start_at, end_at, start_day::text AS start_day, end_day::text AS end_day, location, note, calendar_id::text AS calendar_id`;
  return { ...r, calendar_name: calendar.name };
}

/** Change an entry; `calendarId` moves it to another calendar that keeps entries (null: it stays). */
export async function updateEntry(sql: Sql, id: number, row: EntryRow, calendarId: number | null = null): Promise<DbEntry | null> {
  const [r] = await sql<DbEntry[]>`
    UPDATE calendar.entries e SET title = ${row.title}, all_day = ${row.all_day}, start_at = ${row.start_at}, end_at = ${row.end_at},
           start_day = ${row.start_day}, end_day = ${row.end_day}, location = ${row.location}, note = ${row.note},
           calendar_id = coalesce(${calendarId}::bigint, e.calendar_id)
     WHERE e.id = ${id}
    RETURNING e.id, e.title, e.all_day, e.start_at, e.end_at, e.start_day::text AS start_day, e.end_day::text AS end_day, e.location, e.note,
              e.calendar_id::text AS calendar_id, (SELECT name FROM calendar.calendars c WHERE c.id = e.calendar_id) AS calendar_name`;
  return r ?? null;
}

export async function removeEntry(sql: Sql, id: number): Promise<boolean> {
  const rows = await sql`DELETE FROM calendar.entries WHERE id = ${id} RETURNING id`;
  return rows.length > 0;
}
