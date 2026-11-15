import { fail, instantIn, todayIn, type ExtActions, type ExtLoad } from '$shell';
import { addEntry, removeEntry } from '../lib/entries.server';
import { ownId, parseEntry } from '../lib/entry';
import { linksOf } from '../lib/feeds.server';
import { addDays, monthGrid, pickMonth } from '../lib/month';

const zone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
const EXT_ID = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
/** The apps a profile switched off on its calendar (the chips), kept per profile: the calendar is shared. */
const hiddenKey = (profileId: string) => `hidden:${profileId}`;
function parseHidden(v: string | null): string[] {
  try {
    const a = JSON.parse(v ?? '[]');
    return Array.isArray(a) ? a.filter((x): x is string => typeof x === 'string' && EXT_ID.test(x)).slice(0, 50) : [];
  } catch {
    return [];
  }
}

export const load = (async ({ url }, ctx) => {
  const tz = zone();
  const today = todayIn(tz);
  const { month, selected } = pickMonth(url.searchParams.get('m'), url.searchParams.get('d'), today);
  const grid = monthGrid(month);
  const [cal, links, hidden] = await Promise.all([
    ctx.calendar.entries({ from: instantIn(grid.first, '00:00', tz), to: instantIn(addDays(grid.last, 1), '00:00', tz) }),
    linksOf(ctx),
    ctx.kv.get(hiddenKey(ctx.profileId)).then(parseHidden)
  ]);
  return {
    today,
    timeZone: tz,
    month,
    selected,
    weeks: grid.weeks,
    entries: cal.entries,
    sources: cal.sources,
    subscriptions: links.length,
    hidden
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
  /** The chips: which apps this profile keeps off its calendar. */
  hidden: async ({ request }, ctx) => {
    const ids = parseHidden(JSON.stringify((await request.formData()).getAll('id').map(String)));
    await ctx.kv.set(hiddenKey(ctx.profileId), JSON.stringify(ids));
    return { hidden: ids };
  },
  remove: async ({ request }, ctx) => {
    const id = ownId((await request.formData()).get('id'));
    if (id === null) return fail(400, { error: ctx.t('This entry belongs to another app.') });
    await ctx.db((sql) => removeEntry(sql, id));
    return { removed: true };
  }
};
