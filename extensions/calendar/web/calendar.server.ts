/**
 * The calendar's own part of the shared calendar (core spec 002, "Calendar entries"): the entries added
 * here or by Claude, and every subscribed calendar. Other extensions add theirs through their own
 * web/calendar.server.ts; the page reads all of them through ctx.calendar.
 */
import { dayIn, type ExtCalendar } from '$shell';
import { entriesIn } from './lib/entries.server';
import { toEntry } from './lib/entry';
import { feedEntries } from './lib/feeds.server';

export const calendar: ExtCalendar = {
  async entries(ctx, range) {
    const days = { first: dayIn(range.from, range.timeZone), last: dayIn(new Date(range.to.getTime() - 1), range.timeZone) };
    const [own, feeds] = await Promise.all([
      ctx.db((sql) => entriesIn(sql, range, days)),
      // The shell gives every extension 6 s; a slow provider gets less, so the own entries still show.
      feedEntries(ctx, range, 4500)
    ]);
    return [...own.map((r) => toEntry(r, (d) => dayIn(d, range.timeZone))), ...feeds];
  }
};
