import { error, fail, redirect, todayIn, type ExtActions, type ExtLoad } from '$shell';
import { deleteSessions, fullLibrary, insertSession, logSession, plans, saveTemplate, sessionById, templateById, touchTemplate, updateSession } from '../../../lib/db.server';
import { cleanItems, garminWorkout, isDay, mainSport, sessionProblems, type Session, type SessionInput, type SessionResult, type Status } from '../../../lib/model';

const ID = /^[A-Za-z0-9_-]{1,80}$/;

/** A workout, or a new one (`new`, not saved until Save): ?day=, ?plan=, ?template= fill it. */
export const load = (async ({ params, url }, ctx) => {
  const id = params.id ?? '';
  if (!ID.test(id)) throw error(404, 'No such workout');
  const p = ctx.dataProfileId!;
  return ctx.db(async (sql) => {
    const [pl, library] = await Promise.all([plans(sql, p), fullLibrary(sql, p)]);
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
      isNew: id === 'new',
      template: id === 'new' ? (url.searchParams.get('template') ?? '') : '',
      plan: pl.find((x) => x.id === s.plan_id) ?? null,
      plans: pl.filter((x) => x.state !== 'finished' || x.id === s.plan_id),
      library,
      watchable: !!garminWorkout(s)
    };
  });
}) satisfies ExtLoad;

export const actions: ExtActions = {
  /**
   * The whole page in one form: details, items (JSON, with ticked sets), effort and note. how: save (the
   * status stays), finish (done), skip, reopen (planned again), template (also saved as a template).
   */
  save: async ({ params, request }, ctx) => {
    const f = await request.formData();
    const get = (k: string) => String(f.get(k) ?? '').trim();
    const how = get('how') || 'save';
    let items;
    try {
      items = cleanItems(JSON.parse(get('items') || '[]'));
    } catch {
      return fail(400, { error: ctx.t('The workout could not be read; reload the page.') });
    }
    const s: SessionInput = {
      day: get('day'),
      title: get('title'),
      time_local: get('time') || null,
      description: get('description') || null,
      duration_min: get('duration') ? Number(get('duration')) : null,
      plan_id: get('plan') || null,
      items
    };
    const problems = sessionProblems(s, true);
    if (problems.length) return fail(400, { error: ctx.t('Check the fields: {list}.', { list: problems.join('; ') }) });
    const rpe = Number(f.get('rpe'));
    const note = get('note').slice(0, 2000);
    const started = get('started_at');
    const p = ctx.dataProfileId!;
    const id = params.id ?? '';
    const isNew = id === 'new';
    const tplName = get('template_name');
    if (how === 'template' && !tplName) return fail(400, { error: ctx.t('Give the template a name.') });

    const saved = await ctx.db(async (sql) => {
      const cur = isNew ? null : await sessionById(sql, p, id);
      if (!isNew && !cur) return null;
      const sid = isNew ? await insertSession(sql, p, s) : (await updateSession(sql, p, id, s), id);
      if (isNew && get('template')) await touchTemplate(sql, p, get('template'));
      const was: Status = cur?.status ?? 'planned';
      const status: Status = how === 'finish' ? 'done' : how === 'skip' ? 'skipped' : how === 'reopen' ? 'planned' : was;
      const result: SessionResult = {
        ...(cur?.result ?? {}),
        ...(f.get('rpe') && Number.isInteger(rpe) && rpe >= 0 && rpe <= 10 ? { rpe } : { rpe: undefined }),
        ...(note ? { note } : { note: undefined }),
        ...(started && !Number.isNaN(Date.parse(started)) ? { started_at: new Date(started).toISOString() } : {}),
        ...(how === 'finish' ? { finished_at: new Date().toISOString() } : {})
      };
      const clean = JSON.parse(JSON.stringify(result));
      await logSession(sql, p, sid, status, Object.keys(clean).length ? clean : null);
      if (how === 'template') await saveTemplate(sql, p, { name: tplName.slice(0, 120), description: s.description, items });
      return sid;
    });
    if (!saved) return fail(404, { error: ctx.t('No such workout') });
    if (isNew) throw redirect(303, `/training/session/${saved}`);
    return { saved: how };
  },
  remove: async ({ params }, ctx) => {
    const s = await ctx.db((sql) => sessionById(sql, ctx.dataProfileId!, params.id ?? ''));
    await ctx.db((sql) => deleteSessions(sql, ctx.dataProfileId!, [params.id ?? '']));
    throw redirect(303, s ? `/training?w=${s.day}` : '/training');
  }
};
