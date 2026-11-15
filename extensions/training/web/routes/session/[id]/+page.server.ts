import { error, fail, redirect, type ExtActions, type ExtLoad } from '$shell';
import { deleteSessions, logSession, plans, sessionById, updateSession } from '../../../lib/db.server';
import { cleanExercises, garminWorkout, sessionProblems, type SessionInput, type SessionResult, type Status } from '../../../lib/model';

const ID = /^[A-Za-z0-9_-]{1,80}$/;

export const load = (async ({ params }, ctx) => {
  const id = params.id ?? '';
  if (!ID.test(id)) throw error(404, 'No such session');
  const [s, pl] = await ctx.db((sql) => Promise.all([sessionById(sql, ctx.dataProfileId!, id), plans(sql, ctx.dataProfileId!, { all: true })]));
  if (!s) throw error(404, 'No such session');
  return { session: s, plan: pl.find((x) => x.id === s.plan_id) ?? null, plans: pl.filter((x) => x.status === 'active'), watchable: !!garminWorkout(s) };
}) satisfies ExtLoad;

export const actions: ExtActions = {
  /** Day, time, title, description, minutes, plan. */
  edit: async ({ params, request }, ctx) => {
    const f = await request.formData();
    const get = (k: string) => String(f.get(k) ?? '').trim();
    const s: SessionInput = {
      day: get('day'),
      title: get('title'),
      sport: get('sport'),
      time_local: get('time') || null,
      description: get('description') || null,
      duration_min: get('duration') ? Number(get('duration')) : null,
      plan_id: get('plan') || null
    };
    const problems = sessionProblems(s, true);
    if (problems.length) return fail(400, { error: ctx.t('Check the fields: {list}.', { list: problems.join('; ') }) });
    if (!(await ctx.db((sql) => updateSession(sql, ctx.dataProfileId!, params.id ?? '', s)))) return fail(404, { error: ctx.t('No such session') });
    return { saved: true };
  },
  /** The logger: sets done (JSON from the page), RPE and note; finish = done, skip = skipped, save = still planned. */
  log: async ({ params, request }, ctx) => {
    const f = await request.formData();
    const how = String(f.get('how') ?? 'save');
    let exercises = null;
    try {
      exercises = cleanExercises(JSON.parse(String(f.get('exercises') ?? 'null')));
    } catch {
      return fail(400, { error: ctx.t('The sets could not be read; reload the page.') });
    }
    const rpe = Number(f.get('rpe'));
    const note = String(f.get('note') ?? '').trim().slice(0, 2000);
    const started = String(f.get('started_at') ?? '');
    const result: SessionResult = {
      ...(exercises?.length ? { exercises } : {}),
      ...(f.get('rpe') && Number.isInteger(rpe) && rpe >= 0 && rpe <= 10 ? { rpe } : {}),
      ...(note ? { note } : {}),
      ...(started && !Number.isNaN(Date.parse(started)) ? { started_at: new Date(started).toISOString() } : {}),
      ...(how === 'finish' ? { finished_at: new Date().toISOString() } : {})
    };
    const status: Status = how === 'finish' ? 'done' : how === 'skip' ? 'skipped' : how === 'reopen' ? 'planned' : 'planned';
    const ok = await ctx.db(async (sql) => {
      const cur = await sessionById(sql, ctx.dataProfileId!, params.id ?? '');
      if (!cur) return false;
      const keep: Status = how === 'save' ? cur.status : status;
      return logSession(sql, ctx.dataProfileId!, cur.id, keep, Object.keys(result).length ? result : cur.result);
    });
    if (!ok) return fail(404, { error: ctx.t('No such session') });
    return { logged: how };
  },
  remove: async ({ params }, ctx) => {
    await ctx.db((sql) => deleteSessions(sql, ctx.dataProfileId!, [params.id ?? '']));
    throw redirect(303, '/training');
  }
};
