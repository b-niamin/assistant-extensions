import { todayIn, type ExtLoad } from '$shell';
import { doneWorkouts, plans, sessionsIn, templates } from '../lib/db.server';
import { addDays, bests, isDay, mondayOf } from '../lib/model';

/** The week: workouts of the active plan and of no plan, today's, the active plan, templates, best sets. */
export const load = (async ({ url }, ctx) => {
  const today = todayIn();
  const w = url.searchParams.get('w');
  const monday = mondayOf(isDay(w) ? w : today);
  const p = ctx.dataProfileId!;
  const [sessions, pl, tpl, done] = await ctx.db((sql) =>
    Promise.all([sessionsIn(sql, p, monday, addDays(monday, 6), { visible: true }), plans(sql, p), templates(sql, p), doneWorkouts(sql, p, 100)])
  );
  return { today, monday, sessions, active: pl.find((x) => x.active) ?? null, planCount: pl.length, templates: tpl, bests: bests(done).slice(0, 12) };
}) satisfies ExtLoad;
