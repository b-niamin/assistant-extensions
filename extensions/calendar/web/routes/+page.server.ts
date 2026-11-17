import { fail, instantIn, todayIn, type ExtActions, type ExtLoad } from '$shell';
import { withFeeds } from '../lib/cals.server';
import { calendarsOf, hiddenKey, parseHidden } from '../lib/calendars';
import { addEntry, removeEntry } from '../lib/entries.server';
import { ownId, parseEntry } from '../lib/entry';
import { feedStates } from '../lib/feeds.server';
import { addDays, monthGrid, pickMonth } from '../lib/month';
import { daysOf } from '../lib/view';

const zone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

export const load = (async ({ url }, ctx) => {
  const tz = zone();
  const today = todayIn(tz);
  const { month, selected } = pickMonth(url.searchParams.get('m'), url.searchParams.get('d'), today);
  const grid = monthGrid(month);
  // The feeds are fetched once: the calendar's own provider and this list share the cache.
  const [cal, feeds, hidden] = await Promise.all([
    ctx.calendar.entries({ from: instantIn(grid.first, '00:00', tz), to: instantIn(addDays(grid.last, 1), '00:00', tz) }),
    feedStates(ctx, 4500),
    ctx.kv.get(hiddenKey(ctx.profileId))
  ]);
  const inMonth = cal.entries.filter((e) => daysOf(e, tz).some((d) => d.startsWith(month)));
  const rows = await withFeeds(ctx, feeds);
  return {
    today,
    timeZone: tz,
    month,
    selected,
    weeks: grid.weeks,
    entries: cal.entries,
    calendars: calendarsOf(rows, cal.sources, feeds, inMonth),
    // Where a new entry can go: the calendars that keep entries.
    own: rows.filter((r) => !r.feed_id).map((r) => ({ id: r.id, name: r.name, hue: r.hue })),
    hidden: parseHidden(hidden),
    subscriptions: feeds.length
  };
}) satisfies ExtLoad;

// Annotated (not inferred): SvelteKit's tooling would otherwise type it against a ./$types that
// only exists for routes inside apps/web.
export const actions: ExtActions = {
  add: async ({ request }, ctx) => {
    const f = await request.formData();
    const get = (k: string) => String(f.get(k) ?? '');
    const allDay = f.get('all_day') === 'on';
    const r = parseEntry(
      {
        title: get('title'),
        date: get('date'),
        end_date: get('end_date'),
        start_time: allDay ? '' : get('start_time'),
        end_time: allDay ? '' : get('end_time'),
        location: get('location'),
        note: get('note')
      },
      zone(),
      ctx.t
    );
    if ('error' in r) return fail(400, { error: r.error });
    const calendarId = Number(f.get('calendar'));
    if (!Number.isSafeInteger(calendarId)) return fail(400, { error: ctx.t('Pick a calendar for the entry.') });
    const done = await ctx.db(async (sql) => {
      const [c] = await sql<{ id: string; name: string }[]>`
        SELECT id::text, name FROM calendar.calendars WHERE id = ${calendarId} AND feed_id IS NULL`;
      return c ? addEntry(sql, r.row, ctx.profileId, { id: Number(c.id), name: c.name }) : null;
    });
    if (!done) return fail(400, { error: ctx.t('Pick a calendar for the entry.') });
    return { added: true };
  },
  remove: async ({ request }, ctx) => {
    const id = ownId((await request.formData()).get('id'));
    if (id === null) return fail(400, { error: ctx.t('This entry belongs to another app.') });
    await ctx.db((sql) => removeEntry(sql, id));
    return { removed: true };
  }
};
