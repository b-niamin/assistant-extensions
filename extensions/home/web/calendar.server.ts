/**
 * Home Assistant's calendars on the shared calendar (core spec 002, "Calendar entries"): the calendar
 * entities the board watches (home__configure `calendars`, default every one), read live for the range
 * asked and kept 5 min in memory. Home's own board then reads today back through ctx.calendar.
 */
import type { CalendarEntry, ExtCalendar } from '$shell';
import { haEntries } from './lib/calendar';
import { matches, parsePatterns } from './lib/home';
import { clientOf, configOf } from './lib/snapshot.server';

const TTL = 5 * 60_000;
const cache = new Map<string, { at: number; entries: CalendarEntry[] }>();

export const calendar: ExtCalendar = {
  async entries(ctx, range) {
    const client = await clientOf(ctx, 4000);
    if (!client) return [];
    const patterns = parsePatterns((await configOf(ctx)).calendars);
    const start = range.from.toISOString();
    const end = range.to.toISOString();
    const key = `${client.base}|${start}|${end}|${patterns.map(String).join(',')}`;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < TTL) return hit.entries;
    const cals = (await client.ha.calendars()).filter((c) => !patterns.length || matches(c.entity_id, patterns));
    const lists = await Promise.all(cals.map(async (c) => haEntries(await client.ha.events(c.entity_id, start, end), c.entity_id, c.name ?? c.entity_id)));
    const entries = lists.flat();
    if (cache.size > 50) cache.clear();
    cache.set(key, { at: Date.now(), entries });
    return entries;
  }
};
