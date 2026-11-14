import { fail, instantIn, todayIn, type ExtActions, type ExtLoad } from '$shell';
import { addEntry, removeEntry } from '../lib/entries.server';
import { ownId, parseEntry } from '../lib/entry';
import { linksOf } from '../lib/feeds.server';
import { addDays, monthGrid, pickMonth } from '../lib/month';

const zone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

export const load = (async ({ url }, ctx) => {
  const tz = zone();
  const today = todayIn(tz);
  const { month, selected } = pickMonth(url.searchParams.get('m'), url.searchParams.get('d'), today);
  const grid = monthGrid(month);
  const [cal, links] = await Promise.all([
    ctx.calendar.entries({ from: instantIn(grid.first, '00:00', tz), to: instantIn(addDays(grid.last, 1), '00:00', tz) }),
    linksOf(ctx)
  ]);
  return {
    today,
    timeZone: tz,
    month,
    selected,
    weeks: grid.weeks,
    entries: cal.entries,
    sources: cal.sources,
    subscriptions: links.length
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
  remove: async ({ request }, ctx) => {
    const id = ownId((await request.formData()).get('id'));
    if (id === null) return fail(400, { error: ctx.t('This entry belongs to another app.') });
    await ctx.db((sql) => removeEntry(sql, id));
    return { removed: true };
  }
};
