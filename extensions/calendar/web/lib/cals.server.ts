/**
 * The calendars in calendar.calendars: the ones that keep entries here, and one row per subscription
 * (its name and colour; the link itself stays in the secret "links"). A link added in System settings gets
 * its row the first time the page or Claude looks (`withFeeds`).
 */
import type { ExtensionContext, Sql } from '$shell';
import { addItemTo, removeItemFrom } from './calendars';
import { feedId, feedStates, linksOf, type FeedState } from './feeds.server';
import { HUES, nextHue, type Hue } from './calendars';

export interface CalRow {
  id: number;
  name: string;
  hue: Hue;
  feed_id: string | null;
}

export async function listCalendars(sql: Sql): Promise<CalRow[]> {
  const rows = await sql<{ id: string; name: string; hue: Hue; feed_id: string | null }[]>`
    SELECT id::text, name, hue, feed_id FROM calendar.calendars ORDER BY id`;
  return rows.map((r) => ({ ...r, id: Number(r.id) }));
}

/** The calendars, with a row made for every subscription that has none yet (named after the feed). */
export async function withFeeds(ctx: ExtensionContext, feeds: Pick<FeedState, 'id' | 'name'>[]): Promise<CalRow[]> {
  return ctx.db(async (sql) => {
    let rows = await listCalendars(sql);
    const missing = feeds.filter((f) => !rows.some((r) => r.feed_id === f.id));
    for (const f of missing) {
      await sql`INSERT INTO calendar.calendars (name, hue, feed_id) VALUES (${f.name.slice(0, 60)}, ${nextHue(rows.map((r) => r.hue))}, ${f.id})
                ON CONFLICT (feed_id) DO NOTHING`;
      rows = await listCalendars(sql);
    }
    return rows;
  });
}

export async function addOwnCalendar(sql: Sql, name: string, hue: Hue, by: string): Promise<CalRow> {
  const [r] = await sql<{ id: string }[]>`
    INSERT INTO calendar.calendars (name, hue, created_by) VALUES (${name}, ${hue}, ${by}) RETURNING id::text`;
  return { id: Number(r.id), name, hue, feed_id: null };
}

/** Subscribe: the link joins the secret list and gets its row with the name and colour picked. */
export async function addLinkCalendar(ctx: ExtensionContext, url: string, name: string, hue: Hue): Promise<CalRow> {
  const stored = await ctx.secrets.get('links');
  await ctx.secrets.set('links', addItemTo(stored, url));
  const id = feedId(url);
  return ctx.db(async (sql) => {
    const [r] = await sql<{ id: string }[]>`
      INSERT INTO calendar.calendars (name, hue, feed_id, created_by) VALUES (${name}, ${hue}, ${id}, ${ctx.profileId})
      ON CONFLICT (feed_id) DO UPDATE SET name = EXCLUDED.name, hue = EXCLUDED.hue RETURNING id::text`;
    return { id: Number(r.id), name, hue, feed_id: id };
  });
}

export async function updateCalendar(sql: Sql, id: number, name: string, hue: Hue): Promise<boolean> {
  const rows = await sql`UPDATE calendar.calendars SET name = ${name}, hue = ${hue} WHERE id = ${id} RETURNING id`;
  return rows.length > 0;
}

/** Remove a calendar: its entries go with it; a subscription's link leaves the secret list. */
export async function removeCalendar(ctx: ExtensionContext, id: number): Promise<boolean> {
  const row = await ctx.db(async (sql) => (await listCalendars(sql)).find((r) => r.id === id) ?? null);
  if (!row) return false;
  if (row.feed_id) {
    const urls = await linksOf(ctx);
    const url = urls.find((u) => feedId(u) === row.feed_id);
    if (url) await ctx.secrets.set('links', removeItemFrom(urls, url) || null);
  }
  await ctx.db((sql) => sql`DELETE FROM calendar.calendars WHERE id = ${id}`);
  return true;
}

/** The calendar a new entry goes into: the one named, else the first that keeps entries, else a new one. */
export async function calendarForEntry(sql: Sql, wanted: number | string | null, fallbackName: string, by: string): Promise<CalRow | null> {
  const own = (await listCalendars(sql)).filter((r) => !r.feed_id);
  if (wanted !== null && wanted !== '') {
    const w = String(wanted).trim().toLowerCase();
    return own.find((r) => String(r.id) === w || r.name.toLowerCase() === w) ?? null;
  }
  return own[0] ?? addOwnCalendar(sql, fallbackName, HUES[0], by);
}

export { feedStates };
