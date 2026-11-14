/** The calendar's own entries in calendar.entries (shared by every profile). */
import type { CalendarRange, Sql } from '$shell';
import type { DbEntry, EntryRow } from './entry';

/** Entries that overlap the range: timed ones by instant, all-day ones by the owner's days. */
export function entriesIn(sql: Sql, range: CalendarRange, days: { first: string; last: string }, limit = 2000) {
  return sql<DbEntry[]>`
    SELECT id, title, all_day, start_at, end_at, start_day::text AS start_day, end_day::text AS end_day, location, note
      FROM calendar.entries
     WHERE (NOT all_day AND start_at < ${range.to} AND (end_at > ${range.from} OR (end_at = start_at AND start_at >= ${range.from})))
        OR (all_day AND start_day <= ${days.last}::date AND end_day > ${days.first}::date)
     ORDER BY coalesce(start_day::timestamptz, start_at), id
     LIMIT ${limit}`;
}

export async function addEntry(sql: Sql, row: EntryRow, by: string): Promise<DbEntry> {
  const [r] = await sql<DbEntry[]>`
    INSERT INTO calendar.entries (title, all_day, start_at, end_at, start_day, end_day, location, note, created_by)
    VALUES (${row.title}, ${row.all_day}, ${row.start_at}, ${row.end_at}, ${row.start_day}, ${row.end_day}, ${row.location}, ${row.note}, ${by})
    RETURNING id, title, all_day, start_at, end_at, start_day::text AS start_day, end_day::text AS end_day, location, note`;
  return r;
}

export async function updateEntry(sql: Sql, id: number, row: EntryRow): Promise<DbEntry | null> {
  const [r] = await sql<DbEntry[]>`
    UPDATE calendar.entries SET title = ${row.title}, all_day = ${row.all_day}, start_at = ${row.start_at}, end_at = ${row.end_at},
           start_day = ${row.start_day}, end_day = ${row.end_day}, location = ${row.location}, note = ${row.note}
     WHERE id = ${id}
    RETURNING id, title, all_day, start_at, end_at, start_day::text AS start_day, end_day::text AS end_day, location, note`;
  return r ?? null;
}

export async function removeEntry(sql: Sql, id: number): Promise<boolean> {
  const rows = await sql`DELETE FROM calendar.entries WHERE id = ${id} RETURNING id`;
  return rows.length > 0;
}
