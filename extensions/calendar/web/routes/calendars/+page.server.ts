import { fail, instantIn, nextDay, todayIn, type ExtActions, type ExtLoad } from '$shell';
import { addLinkCalendar, addOwnCalendar, removeCalendar, updateCalendar, withFeeds } from '../../lib/cals.server';
import { calendarsOf, hiddenKey, isHue, nextHue, parseHidden, switchCalendar } from '../../lib/calendars';
import { feedStates } from '../../lib/feeds.server';
import { feedUrls } from '../../lib/ics';

const zone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

/** Every calendar: the ones added here (own or from a link) and the apps that put dates on the calendar. */
export const load = (async (_event, ctx) => {
  const tz = zone();
  const today = todayIn(tz);
  const [cal, feeds, hidden] = await Promise.all([
    ctx.calendar.entries({ from: instantIn(today, '00:00', tz), to: instantIn(nextDay(today), '00:00', tz) }),
    feedStates(ctx, 4500),
    ctx.kv.get(hiddenKey(ctx.profileId))
  ]);
  const rows = await withFeeds(ctx, feeds);
  return {
    calendars: calendarsOf(rows, cal.sources, feeds, []),
    errors: Object.fromEntries(feeds.filter((f) => f.error).map((f) => [`calendar:${f.id}`, f.error!])),
    hidden: parseHidden(hidden),
    nextHue: nextHue(rows.map((r) => r.hue))
  };
}) satisfies ExtLoad;

const nameOf = (f: FormData) => String(f.get('name') ?? '').trim().slice(0, 60);

export const actions: ExtActions = {
  /** A new calendar: one that keeps entries, or a subscription to a link (ICS or webcal). */
  add: async ({ request }, ctx) => {
    const f = await request.formData();
    const name = nameOf(f);
    const hue = f.get('hue');
    if (!name) return fail(400, { error: ctx.t('Give the calendar a name.') });
    if (!isHue(hue)) return fail(400, { error: ctx.t('Pick a colour.') });
    if (f.get('kind') === 'link') {
      const [url] = feedUrls(String(f.get('link') ?? ''));
      if (!url) return fail(400, { error: ctx.t('Paste the calendar link (it starts with https:// or webcal://).') });
      try {
        await addLinkCalendar(ctx, url, name, hue);
      } catch (e) {
        return fail(400, { error: e instanceof Error ? ctx.t(e.message) : String(e) });
      }
    } else await ctx.db((sql) => addOwnCalendar(sql, name, hue, ctx.profileId));
    return { added: true };
  },
  edit: async ({ request }, ctx) => {
    const f = await request.formData();
    const name = nameOf(f);
    const hue = f.get('hue');
    if (!name || !isHue(hue)) return fail(400, { error: ctx.t('Give the calendar a name.') });
    const id = Number(f.get('id'));
    if (!Number.isSafeInteger(id) || !(await ctx.db((sql) => updateCalendar(sql, id, name, hue)))) return fail(404, { error: ctx.t('No such calendar.') });
    return { saved: true };
  },
  remove: async ({ request }, ctx) => {
    const id = Number((await request.formData()).get('id'));
    if (!Number.isSafeInteger(id) || !(await removeCalendar(ctx, id))) return fail(404, { error: ctx.t('No such calendar.') });
    return { removed: true };
  },
  /** Show or hide one calendar for the viewing profile. */
  show: async ({ request }, ctx) => {
    const f = await request.formData();
    const key = hiddenKey(ctx.profileId);
    const next = switchCalendar(parseHidden(await ctx.kv.get(key)), String(f.get('key') ?? ''), f.get('on') === '1');
    if (!next) return fail(400, { error: ctx.t('No such calendar.') });
    if (next.length) await ctx.kv.set(key, JSON.stringify(next));
    else await ctx.kv.remove(key);
    return { hidden: next };
  }
};
