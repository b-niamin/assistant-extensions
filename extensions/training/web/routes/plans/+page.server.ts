import { fail, type ExtActions, type ExtLoad } from '$shell';
import { insertPlan, plans, setActivePlan } from '../../lib/db.server';
import { isDay } from '../../lib/model';

/** Every plan: the active one, the waiting ones, the finished ones; a new plan. */
export const load = (async (_event, ctx) => ({ plans: await ctx.db((sql) => plans(sql, ctx.dataProfileId!)) })) satisfies ExtLoad;

export const actions: ExtActions = {
  create: async ({ request }, ctx) => {
    const f = await request.formData();
    const get = (k: string) => String(f.get(k) ?? '').trim();
    const name = get('name');
    const start = get('start_day');
    const end = get('end_day');
    if (!name || name.length > 120) return fail(400, { error: ctx.t('Give the plan a name.') });
    if ((start && !isDay(start)) || (end && !isDay(end)) || (start && end && end < start)) return fail(400, { error: ctx.t('Check the dates: the end comes after the start.') });
    const id = await ctx.db((sql) => insertPlan(sql, ctx.dataProfileId!, { name, goal: get('goal').slice(0, 1000), start_day: start, end_day: end }, f.get('active') === 'on'));
    return { created: id };
  },
  /** Makes a plan the active one (plan id), or none (empty). */
  activate: async ({ request }, ctx) => {
    const id = String((await request.formData()).get('plan') ?? '') || null;
    if (!(await ctx.db((sql) => setActivePlan(sql, ctx.dataProfileId!, id)))) return fail(404, { error: ctx.t('No such plan.') });
    return { active: id };
  }
};
