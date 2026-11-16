import { error, fail, redirect, todayIn, type ExtActions, type ExtLoad } from '$shell';
import { deletePlan, planSessions, plans, setActivePlan, updatePlan } from '../../../lib/db.server';
import { isDay } from '../../../lib/model';

/** One plan: its details and every workout in it, by week. */
export const load = (async ({ params }, ctx) => {
  const p = ctx.dataProfileId!;
  const [pl, sessions] = await ctx.db((sql) => Promise.all([plans(sql, p), planSessions(sql, p, params.id ?? '')]));
  const plan = pl.find((x) => x.id === params.id);
  if (!plan) throw error(404, 'No such plan');
  return { plan, sessions, today: todayIn() };
}) satisfies ExtLoad;

export const actions: ExtActions = {
  edit: async ({ params, request }, ctx) => {
    const f = await request.formData();
    const get = (k: string) => String(f.get(k) ?? '').trim();
    const start = get('start_day');
    const end = get('end_day');
    if (!get('name') || get('name').length > 120) return fail(400, { error: ctx.t('Give the plan a name.') });
    if ((start && !isDay(start)) || (end && !isDay(end)) || (start && end && end < start)) return fail(400, { error: ctx.t('Check the dates: the end comes after the start.') });
    const ok = await ctx.db((sql) =>
      updatePlan(sql, ctx.dataProfileId!, params.id ?? '', { name: get('name'), goal: get('goal').slice(0, 1000), start_day: start, end_day: end, notes: get('notes').slice(0, 4000) })
    );
    if (!ok) return fail(404, { error: ctx.t('No such plan.') });
    return { saved: true };
  },
  /** how: activate, pause (waiting), finish, archive, reopen. */
  state: async ({ params, request }, ctx) => {
    const how = String((await request.formData()).get('how') ?? '');
    const id = params.id ?? '';
    await ctx.db(async (sql) => {
      if (how === 'activate') await setActivePlan(sql, ctx.dataProfileId!, id);
      else if (how === 'pause') await sql`UPDATE training.plans SET active = false, updated_at = now() WHERE profile_id = ${ctx.dataProfileId!} AND id = ${id}`;
      else if (how === 'finish' || how === 'archive') await updatePlan(sql, ctx.dataProfileId!, id, { status: how === 'finish' ? 'done' : 'archived' });
      else if (how === 'reopen') await updatePlan(sql, ctx.dataProfileId!, id, { status: 'active' });
    });
    return { state: how };
  },
  remove: async ({ params, request }, ctx) => {
    const withSessions = (await request.formData()).get('with_sessions') === 'on';
    await ctx.db((sql) => deletePlan(sql, ctx.dataProfileId!, params.id ?? '', withSessions));
    throw redirect(303, '/training/plans');
  }
};
