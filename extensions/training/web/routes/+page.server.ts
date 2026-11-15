import { fail, redirect, todayIn, type ExtActions, type ExtLoad } from '$shell';
import { insertSession, plans, sessionsIn, strengthResults, templateById, templates, touchTemplate } from '../lib/db.server';
import { addDays, bests, isDay, mondayOf, sessionProblems, type SessionInput } from '../lib/model';

export const load = (async ({ url }, ctx) => {
  const today = todayIn();
  const w = url.searchParams.get('w');
  const monday = mondayOf(isDay(w) ? w : today);
  const p = ctx.dataProfileId!;
  const [sessions, pl, tpl, results] = await ctx.db((sql) =>
    Promise.all([sessionsIn(sql, p, monday, addDays(monday, 6)), plans(sql, p), templates(sql, p), strengthResults(sql, p, 100)])
  );
  return { today, monday, sessions, plans: pl, templates: tpl, bests: bests(results).slice(0, 12) };
}) satisfies ExtLoad;

export const actions: ExtActions = {
  add: async ({ request }, ctx) => {
    const f = await request.formData();
    const get = (k: string) => String(f.get(k) ?? '').trim();
    const s: SessionInput = {
      day: get('day'),
      sport: get('sport'),
      title: get('title'),
      time_local: get('time') || null,
      description: get('description') || null,
      duration_min: get('duration') ? Number(get('duration')) : null,
      plan_id: get('plan') || null
    };
    const problems = sessionProblems(s, true);
    if (problems.length) return fail(400, { error: ctx.t('Check the fields: {list}.', { list: problems.join('; ') }) });
    const id = await ctx.db((sql) => insertSession(sql, ctx.dataProfileId!, s));
    return { added: id };
  },
  /** Start a workout now from a template: a session today, opened for logging. */
  start: async ({ request }, ctx) => {
    const id = String((await request.formData()).get('template') ?? '');
    const p = ctx.dataProfileId!;
    const sid = await ctx.db(async (sql) => {
      const t = await templateById(sql, p, id);
      if (!t) return null;
      await touchTemplate(sql, p, id);
      return insertSession(sql, p, { day: todayIn(), sport: t.sport, title: t.name, description: t.description, steps: t.steps as SessionInput['steps'], exercises: t.exercises });
    });
    if (!sid) return fail(404, { error: ctx.t('No such template.') });
    throw redirect(303, `/training/session/${sid}`);
  }
};
