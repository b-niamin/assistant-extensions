import { fail, redirect, todayIn, type ExtActions, type ExtLoad } from '$shell';
import { deleteTemplate, doneWorkouts, fullLibrary, plans, saveTemplate, sessionById, sessionsIn, templates } from '../lib/db.server';
import { addDays, isDay, mondayOf } from '../lib/model';
import { startWorkout, type StartFrom } from '../lib/start.server';

const goalOf = (v: string | null) => Math.min(7, Math.max(1, Number(v) || 3));

/**
 * The start page, as the gym log's: this week against the goal, quick actions, the workout in progress,
 * the planned ones (runs from the active plan), templates, recovery of the muscles.
 */
export const load = (async ({ url }, ctx) => {
  const today = todayIn();
  const w = url.searchParams.get('w');
  const monday = mondayOf(isDay(w) ? w : today);
  const p = ctx.dataProfileId!;
  const [sessions, pl, tpl, history, library, recent] = await ctx.db((sql) =>
    Promise.all([
      sessionsIn(sql, p, monday, addDays(monday, 6), { visible: true }),
      plans(sql, p),
      templates(sql, p),
      doneWorkouts(sql, p, 300),
      fullLibrary(sql, p),
      sessionsIn(sql, p, addDays(today, -3), addDays(today, 1), { status: 'planned' })
    ])
  );
  const going = recent.filter((s) => s.result?.started_at).at(-1) ?? null;
  return { today, monday, sessions, active: pl.find((x) => x.active) ?? null, templates: tpl, history, library, going, goal: goalOf(await ctx.kv.get('goal')) };
}) satisfies ExtLoad;

export const actions: ExtActions = {
  /** A workout now: empty, again, from a template, a copy of one, or one entry (a run). */
  start: async ({ request }, ctx) => {
    const f = await request.formData();
    const from = String(f.get('from') ?? 'empty');
    const id = String(f.get('id') ?? '');
    const src: StartFrom = from === 'repeat' ? { from } : from === 'template' || from === 'copy' || from === 'entry' ? { from, id } : { from: 'empty' };
    const day = isDay(f.get('day')) ? String(f.get('day')) : todayIn();
    const sid = await ctx.db((sql) => startWorkout(sql, ctx.dataProfileId!, day, src));
    if (!sid) return fail(404, { error: ctx.t('It is not there any more.') });
    throw redirect(303, `/training/session/${sid}${src.from === 'empty' ? '?pick=1' : ''}`);
  },
  goal: async ({ request }, ctx) => {
    const f = await request.formData();
    const cur = goalOf(await ctx.kv.get('goal'));
    const next = Math.min(7, Math.max(1, cur + (f.get('d') === '-1' ? -1 : 1)));
    await ctx.kv.set('goal', String(next));
    return { goal: next };
  },
  /** A template from a logged workout ("+ From the last one"). */
  template: async ({ request }, ctx) => {
    const f = await request.formData();
    const name = String(f.get('name') ?? '').trim().slice(0, 120);
    if (!name) return fail(400, { error: ctx.t('Give the template a name.') });
    const p = ctx.dataProfileId!;
    const ok = await ctx.db(async (sql) => {
      const s = await sessionById(sql, p, String(f.get('id') ?? ''));
      if (!s) return false;
      await saveTemplate(sql, p, { name, items: s.items });
      return true;
    });
    return ok ? { saved: name } : fail(404, { error: ctx.t('It is not there any more.') });
  },
  untemplate: async ({ request }, ctx) => {
    const id = String((await request.formData()).get('id') ?? '');
    await ctx.db((sql) => deleteTemplate(sql, ctx.dataProfileId!, id));
    return { removed: id };
  }
};
