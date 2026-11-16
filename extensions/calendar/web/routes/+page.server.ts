import { fail, instantIn, todayIn, type ExtActions, type ExtLoad } from '$shell';
import { calendarsOf, hiddenKey, parseHidden, switchCalendar } from '../lib/calendars';
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
  return {
    today,
    timeZone: tz,
    month,
    selected,
    weeks: grid.weeks,
    entries: cal.entries,
    calendars: calendarsOf(
      cal.sources,
      feeds.map((f) => ({ id: f.id, name: f.name, ok: f.ok })),
      inMonth,
      ctx.t('My entries')
    ),
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
    await ctx.db((sql) => addEntry(sql, r.row, ctx.profileId));
    return { added: true };
  },
  /** Switch one calendar on or off for the viewing profile. */
  calendars: async ({ request }, ctx) => {
    const f = await request.formData();
    const key = hiddenKey(ctx.profileId);
    const next = switchCalendar(parseHidden(await ctx.kv.get(key)), String(f.get('key') ?? ''), f.get('on') === '1');
    if (!next) return fail(400, { error: ctx.t('No such calendar.') });
    if (next.length) await ctx.kv.set(key, JSON.stringify(next));
    else await ctx.kv.remove(key);
    return { hidden: next };
  },
  remove: async ({ request }, ctx) => {
    const id = ownId((await request.formData()).get('id'));
    if (id === null) return fail(400, { error: ctx.t('This entry belongs to another app.') });
    await ctx.db((sql) => removeEntry(sql, id));
    return { removed: true };
  }
};
