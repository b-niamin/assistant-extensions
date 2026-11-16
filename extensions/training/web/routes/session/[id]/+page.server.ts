import { error, fail, redirect, todayIn, type ExtActions, type ExtLoad } from '$shell';
import { deleteSessions, doneWorkouts, fullLibrary, insertSession, logSession, plans, saveTemplate, sessionById, templateById, touchTemplate, updateSession } from '../../../lib/db.server';
import { cleanItems, garminWorkout, isDay, mainSport, sessionProblems, type Session, type SessionInput, type SessionResult, type Status } from '../../../lib/model';

const ID = /^[A-Za-z0-9_-]{1,80}$/;

/**
 * A workout, as the gym log showed one: the items to tick off, last time's sets, the rest timer. `new`
 * (with ?day=, ?plan=, ?template=) is saved on its first change.
 */
export const load = (async ({ params, url }, ctx) => {
  const id = params.id ?? '';
  if (!ID.test(id)) throw error(404, 'No such workout');
  const p = ctx.dataProfileId!;
  return ctx.db(async (sql) => {
    const [pl, library, history] = await Promise.all([plans(sql, p), fullLibrary(sql, p), doneWorkouts(sql, p, 300)]);
    let s: Session | null;
    if (id === 'new') {
      const day = url.searchParams.get('day');
      const planQ = url.searchParams.get('plan');
      const tpl = url.searchParams.get('template') ? await templateById(sql, p, url.searchParams.get('template')!) : null;
      const items = tpl?.items ?? [];
      s = {
        id: 'new',
        plan_id: pl.find((x) => x.id === planQ)?.id ?? pl.find((x) => x.active)?.id ?? null,
        day: isDay(day) ? day : todayIn(),
        time_local: null,
        sport: mainSport(items),
        title: tpl?.name ?? '',
        description: tpl?.description ?? null,
        duration_min: null,
        items,
        status: 'planned',
        result: null,
        done_at: null,
        activity_ref: null,
        sent_at: null,
        source: null
      };
    } else s = await sessionById(sql, p, id);
    if (!s) throw error(404, 'No such workout');
    return {
      session: s,
      today: todayIn(),
      template: id === 'new' ? (url.searchParams.get('template') ?? '') : '',
      plan: pl.find((x) => x.id === s.plan_id) ?? null,
      plans: pl.filter((x) => x.state !== 'finished' || x.id === s.plan_id),
      library,
      history,
      watchable: !!garminWorkout(s)
    };
  });
}) satisfies ExtLoad;

/** The page's state in a form: details, items (JSON), started_at, effort and note. */
async function read(request: Request) {
  const f = await request.formData();
  const get = (k: string) => String(f.get(k) ?? '').trim();
  let items;
  try {
    items = cleanItems(JSON.parse(get('items') || '[]'));
  } catch {
    items = null;
  }
  const s: SessionInput = {
    day: get('day'),
    title: get('title'),
    time_local: get('time') || null,
    description: get('description') || null,
    plan_id: get('plan') || null,
    ...(items ? { items } : {})
  };
  const rpe = Number(get('rpe'));
  return { f, get, items, s, rpe: get('rpe') !== '' && Number.isInteger(rpe) && rpe >= 0 && rpe <= 10 ? rpe : undefined };
}

/** Saves the workout (a new one is created), with a status change: keep, done, skipped, planned. */
async function save(params: Partial<Record<string, string>>, request: Request, ctx: Parameters<ExtActions[string]>[1], how: 'keep' | Status) {
  const { get, items, s, rpe } = await read(request);
  if (!items) return { problem: ctx.t('The workout could not be read; reload the page.') };
  const problems = sessionProblems({ ...s, title: s.title || undefined }, false);
  if (problems.length) return { problem: ctx.t('Check the fields: {list}.', { list: problems.join('; ') }) };
  const p = ctx.dataProfileId!;
  const id = params.id ?? '';
  const started = get('started_at');
  const id2 = await ctx.db(async (sql) => {
    const isNew = id === 'new';
    const cur = isNew ? null : await sessionById(sql, p, id);
    if (!isNew && !cur) return null;
    const input = { ...s, title: s.title || undefined };
    const sid = isNew ? await insertSession(sql, p, { ...input, day: isDay(s.day) ? s.day : todayIn() }) : (await updateSession(sql, p, id, input), id);
    if (isNew && get('template')) await touchTemplate(sql, p, get('template'));
    const status: Status = how === 'keep' ? (cur?.status ?? 'planned') : how;
    const result: SessionResult = {
      ...(cur?.result ?? {}),
      rpe,
      note: get('note').slice(0, 2000) || undefined,
      ...(started && !Number.isNaN(Date.parse(started)) ? { started_at: new Date(started).toISOString() } : {}),
      ...(how === 'done' && !cur?.result?.finished_at ? { finished_at: new Date().toISOString() } : {})
    };
    const clean = JSON.parse(JSON.stringify(result));
    await logSession(sql, p, sid, status, Object.keys(clean).length ? clean : null);
    return sid;
  });
  return id2 ? { id: id2 } : { problem: ctx.t('No such workout') };
}

export const actions: ExtActions = {
  /** Every change, a moment after it is made. */
  autosave: async ({ params, request }, ctx) => {
    const r = await save(params, request, ctx, 'keep');
    return r.problem ? fail(400, { error: r.problem }) : { id: r.id };
  },
  finish: async ({ params, request }, ctx) => {
    const r = await save(params, request, ctx, 'done');
    return r.problem ? fail(400, { error: r.problem }) : { id: r.id, saved: 'finish' };
  },
  skip: async ({ params, request }, ctx) => {
    const r = await save(params, request, ctx, 'skipped');
    return r.problem ? fail(400, { error: r.problem }) : { id: r.id, saved: 'skip' };
  },
  reopen: async ({ params, request }, ctx) => {
    const r = await save(params, request, ctx, 'planned');
    return r.problem ? fail(400, { error: r.problem }) : { id: r.id, saved: 'reopen' };
  },
  /** The workout as a template (sets kept, nothing ticked). */
  template: async ({ request }, ctx) => {
    const { get, items } = await read(request);
    const name = get('template_name').slice(0, 120);
    if (!name) return fail(400, { error: ctx.t('Give the template a name.') });
    await ctx.db((sql) => saveTemplate(sql, ctx.dataProfileId!, { name, items: items ?? [] }));
    return { saved: 'template' };
  },
  remove: async ({ params }, ctx) => {
    const s = await ctx.db((sql) => sessionById(sql, ctx.dataProfileId!, params.id ?? ''));
    await ctx.db((sql) => deleteSessions(sql, ctx.dataProfileId!, [params.id ?? '']));
    throw redirect(303, s ? `/training?w=${s.day}` : '/training');
  }
};
