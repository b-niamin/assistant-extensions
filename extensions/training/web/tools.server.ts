/**
 * Tools for the AI (spec 005 of the core), as `training__<tool>`: full control over plans, sessions and
 * templates of any discipline. Claude joins them with other apps: it puts a session on the Garmin watch
 * with health__send_workout (garmin_workout gives the exact arguments, mark_sent records it), and names
 * the real activity on Strava with health__edit_activity, then links it here with log_session.
 */
import { todayIn, ToolError, type ExtTool, type ExtensionContext } from '$shell';
import {
  deleteSessions,
  deleteTemplate,
  insertSession,
  logSession,
  moveSessions,
  newId,
  planExists,
  plans,
  saveTemplate,
  sessionById,
  sessionsIn,
  setSent,
  strengthResults,
  templateById,
  templates,
  touchTemplate,
  updateSession
} from './lib/db.server';
import {
  addDays,
  bests,
  cleanExercises,
  garminWorkout,
  isDay,
  sessionProblems,
  SPORTS,
  STATUSES,
  type SessionInput,
  type SessionResult,
  type Status
} from './lib/model';

const DAY = { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' };
const EXERCISES = {
  type: 'array',
  maxItems: 40,
  description: 'Strength: [{name, sets: [{reps, kg} or {seconds}], rest_s?, note?}]',
  items: { type: 'object' }
};
const STEPS = {
  type: 'array',
  maxItems: 50,
  description:
    'Endurance, the structured workout for the watch: [{kind: warmup|work|recovery|rest|cooldown, durationType: time (s)|distance (m)|lap, ' +
    'durationValue, target?: {type: pace (low/high s_per_km)|speed|hr (bpm)|power (W)|cadence, low, high}, note?} or {kind: repeat, repeats, steps: [...]}]',
  items: { type: 'object' }
};
const SESSION_PROPS = {
  plan_id: { type: ['string', 'null'], maxLength: 40 },
  day: DAY,
  time_local: { type: ['string', 'null'], description: 'HH:MM, or null for any time of the day' },
  sport: { type: 'string', enum: [...SPORTS] },
  title: { type: 'string', minLength: 1, maxLength: 120 },
  description: { type: ['string', 'null'], maxLength: 4000 },
  duration_min: { type: ['integer', 'null'], minimum: 1, maximum: 1440 },
  distance_m: { type: ['number', 'null'], minimum: 1, maximum: 1000000 },
  steps: { ...STEPS, type: ['array', 'null'] },
  exercises: { ...EXERCISES, type: ['array', 'null'] }
};

const p = (ctx: ExtensionContext) => ctx.dataProfileId!;
const fail = (problems: string[]) => {
  if (problems.length) throw new ToolError(problems.slice(0, 8).join('; '));
};

async function checkPlan(sql: Parameters<Parameters<ExtensionContext['db']>[0]>[0], profile: string, planId: unknown) {
  if (planId && !(await planExists(sql, profile, String(planId)))) throw new ToolError(`No plan ${planId}: create_plan first, or leave plan_id out.`);
}

function asResult(v: unknown): SessionResult | null {
  if (!v || typeof v !== 'object') return null;
  const r = v as Record<string, unknown>;
  const out: SessionResult = {};
  const ex = cleanExercises(r.exercises);
  if (ex?.length) out.exercises = ex;
  const rpe = Number(r.rpe);
  if (r.rpe !== undefined && Number.isInteger(rpe) && rpe >= 0 && rpe <= 10) out.rpe = rpe;
  if (typeof r.note === 'string' && r.note.trim()) out.note = r.note.trim().slice(0, 2000);
  for (const k of ['started_at', 'finished_at'] as const) if (typeof r[k] === 'string' && !Number.isNaN(Date.parse(r[k] as string))) out[k] = new Date(r[k] as string).toISOString();
  return Object.keys(out).length ? out : null;
}

export const tools: ExtTool[] = [
  {
    name: 'overview',
    title: 'Training overview',
    readOnly: true,
    description:
      'The training of a profile: active plans (with counts), every session from `from` to `to` (YYYY-MM-DD, default ' +
      'last 7 days to 21 days ahead) with status planned/done/skipped, what was logged and whether it is on the watch, ' +
      'the templates, and the best set of each strength exercise. Start here.',
    input: { type: 'object', properties: { from: DAY, to: DAY } },
    run: (args, ctx) =>
      ctx.db(async (sql) => {
        const today = todayIn();
        const from = String(args.from ?? addDays(today, -7));
        const to = String(args.to ?? addDays(today, 21));
        const [pl, sessions, tpl, results] = await Promise.all([plans(sql, p(ctx)), sessionsIn(sql, p(ctx), from, to), templates(sql, p(ctx)), strengthResults(sql, p(ctx))]);
        return { today, from, to, plans: pl, sessions, templates: tpl, strength_bests: bests(results) };
      })
  },
  {
    name: 'list_sessions',
    title: 'List sessions',
    readOnly: true,
    description: 'Sessions from `from` to `to` (YYYY-MM-DD, at most 400 days), optionally of one plan or status. At most 500.',
    input: { type: 'object', properties: { from: DAY, to: DAY, plan_id: { type: 'string' }, status: { type: 'string', enum: [...STATUSES] } }, required: ['from', 'to'] },
    run: (args, ctx) => {
      const from = String(args.from);
      const to = String(args.to);
      if (to < from || Date.parse(to) - Date.parse(from) > 400 * 86_400_000) throw new ToolError('to must be after from, at most 400 days later.');
      return ctx.db((sql) => sessionsIn(sql, p(ctx), from, to, { planId: args.plan_id as string | undefined, status: args.status as string | undefined }));
    }
  },
  {
    name: 'get_session',
    title: 'One session',
    readOnly: true,
    description: 'Everything about one session: plan, steps or exercises, status, logged result, linked activity, sent to the watch.',
    input: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    run: (args, ctx) =>
      ctx.db(async (sql) => {
        const s = await sessionById(sql, p(ctx), String(args.id));
        if (!s) throw new ToolError(`No session ${args.id}.`);
        return s;
      })
  },
  {
    name: 'create_plan',
    title: 'Create a training plan',
    readOnly: false,
    description:
      'A plan: a goal over some days ("Half marathon under 1:45", 12 weeks). sport is its main discipline, left out for a mixed plan ' +
      '(runs and gym). Then add its sessions with add_sessions and plan_id. Returns the plan id.',
    input: {
      type: 'object',
      properties: {
        name: { type: 'string', minLength: 1, maxLength: 120 },
        goal: { type: 'string', maxLength: 1000 },
        sport: { type: 'string', enum: [...SPORTS] },
        start_day: DAY,
        end_day: DAY,
        notes: { type: 'string', maxLength: 4000 }
      },
      required: ['name']
    },
    run: (args, ctx) =>
      ctx.db(async (sql) => {
        if (args.start_day && args.end_day && String(args.end_day) < String(args.start_day)) throw new ToolError('end_day is before start_day.');
        const id = newId('p');
        await sql`
          INSERT INTO training.plans (id, profile_id, name, goal, sport, start_day, end_day, notes)
          VALUES (${id}, ${p(ctx)}, ${String(args.name).trim()}, ${(args.goal as string) ?? null}, ${(args.sport as string) ?? null},
                  ${(args.start_day as string) ?? null}, ${(args.end_day as string) ?? null}, ${(args.notes as string) ?? null})`;
        return { id };
      })
  },
  {
    name: 'update_plan',
    title: 'Change a training plan',
    readOnly: false,
    destructive: true,
    description: 'Change the given fields of a plan; status done or archived takes it off the active list (its sessions stay).',
    input: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        name: { type: 'string', minLength: 1, maxLength: 120 },
        goal: { type: ['string', 'null'], maxLength: 1000 },
        sport: { type: ['string', 'null'], enum: [...SPORTS, null] },
        start_day: { type: ['string', 'null'] },
        end_day: { type: ['string', 'null'] },
        status: { type: 'string', enum: ['active', 'done', 'archived'] },
        notes: { type: ['string', 'null'], maxLength: 4000 }
      },
      required: ['id']
    },
    run: (args, ctx) =>
      ctx.db(async (sql) => {
        const set: Record<string, unknown> = {};
        for (const k of ['name', 'goal', 'sport', 'start_day', 'end_day', 'status', 'notes']) if (k in args) set[k] = args[k];
        for (const k of ['start_day', 'end_day']) if (set[k] != null && !isDay(set[k])) throw new ToolError(`${k}: YYYY-MM-DD or null`);
        if (!Object.keys(set).length) throw new ToolError('Nothing to change.');
        const rows = await sql`UPDATE training.plans SET ${sql(set as never)}, updated_at = now() WHERE profile_id = ${p(ctx)} AND id = ${String(args.id)} RETURNING id`;
        if (!rows.length) throw new ToolError(`No plan ${args.id}.`);
        return { updated: args.id };
      })
  },
  {
    name: 'delete_plan',
    title: 'Delete a training plan',
    readOnly: false,
    destructive: true,
    description:
      'Delete a plan. Its sessions stay as single sessions, unless with_sessions is true: then its sessions that are still planned go ' +
      'too (done ones are history and stay). If any were on the watch, take them off with health__remove_workout (ref "training:<id>").',
    input: { type: 'object', properties: { id: { type: 'string' }, with_sessions: { type: 'boolean' } }, required: ['id'] },
    run: (args, ctx) =>
      ctx.db(async (sql) => {
        const removed = args.with_sessions
          ? (await sql`DELETE FROM training.sessions WHERE profile_id = ${p(ctx)} AND plan_id = ${String(args.id)} AND status = 'planned' RETURNING id, sent_at`).map((r) => ({ id: String(r.id), on_watch: !!r.sent_at }))
          : [];
        const rows = await sql`DELETE FROM training.plans WHERE profile_id = ${p(ctx)} AND id = ${String(args.id)} RETURNING id`;
        if (!rows.length) throw new ToolError(`No plan ${args.id}.`);
        return { deleted: args.id, sessions_deleted: removed };
      })
  },
  {
    name: 'add_sessions',
    title: 'Add training sessions',
    readOnly: false,
    description:
      'Add up to 100 sessions at once, e.g. a whole plan. Each: day, sport, title (required), plan_id, time_local, description, ' +
      'duration_min, distance_m, steps (endurance, for the watch) or exercises (strength). A session can also start from a template: ' +
      'template_id fills sport, title, description, steps and exercises unless given. Returns the new ids in order.',
    input: {
      type: 'object',
      properties: {
        sessions: {
          type: 'array',
          minItems: 1,
          maxItems: 100,
          items: { type: 'object', properties: { ...SESSION_PROPS, template_id: { type: 'string' } } }
        }
      },
      required: ['sessions']
    },
    run: (args, ctx) =>
      ctx.db(async (sql) => {
        const list = args.sessions as (SessionInput & { template_id?: string })[];
        const ready: SessionInput[] = [];
        const problems: string[] = [];
        for (const [i, raw] of list.entries()) {
          let s: SessionInput = raw;
          if (raw.template_id) {
            const tpl = await templateById(sql, p(ctx), raw.template_id);
            if (!tpl) {
              problems.push(`sessions[${i}].template_id: no template ${raw.template_id}`);
              continue;
            }
            s = { sport: tpl.sport, title: tpl.name, description: tpl.description, steps: tpl.steps as SessionInput['steps'], exercises: tpl.exercises, ...raw };
            await touchTemplate(sql, p(ctx), tpl.id);
          }
          problems.push(...sessionProblems(s, true).map((x) => `sessions[${i}].${x}`));
          await checkPlan(sql, p(ctx), s.plan_id);
          ready.push(s);
        }
        fail(problems);
        const ids = [];
        for (const s of ready) ids.push(await insertSession(sql, p(ctx), { ...s, status: 'planned' }));
        return { ids };
      })
  },
  {
    name: 'update_session',
    title: 'Change a session',
    readOnly: false,
    destructive: true,
    description:
      'Change the given fields of a session (moving it = a new day and/or time_local). If it is on the watch (sent_at set), send it ' +
      'again with health__send_workout (same ref replaces it) and mark_sent.',
    input: { type: 'object', properties: { id: { type: 'string' }, ...SESSION_PROPS, status: { type: 'string', enum: [...STATUSES] } }, required: ['id'] },
    run: (args, ctx) =>
      ctx.db(async (sql) => {
        const { id, ...fields } = args as unknown as SessionInput & { id: string };
        fail(sessionProblems(fields, false));
        await checkPlan(sql, p(ctx), fields.plan_id);
        if (!(await updateSession(sql, p(ctx), String(id), fields))) throw new ToolError(`No session ${id}.`);
        const s = await sessionById(sql, p(ctx), String(id));
        return { updated: id, on_watch: !!s?.sent_at };
      })
  },
  {
    name: 'move_sessions',
    title: 'Shift sessions by days',
    readOnly: false,
    destructive: true,
    description: 'Move sessions by `days` (negative = earlier): the given ids, or every planned session of plan_id from `from` on (e.g. a week off).',
    input: {
      type: 'object',
      properties: {
        days: { type: 'integer', minimum: -365, maximum: 365 },
        ids: { type: 'array', items: { type: 'string' }, maxItems: 500 },
        plan_id: { type: 'string' },
        from: DAY
      },
      required: ['days']
    },
    run: (args, ctx) =>
      ctx.db(async (sql) => {
        let ids = (args.ids as string[] | undefined) ?? [];
        if (!ids.length && args.plan_id) {
          const rows = await sql`
            SELECT id FROM training.sessions WHERE profile_id = ${p(ctx)} AND plan_id = ${String(args.plan_id)} AND status = 'planned'
               AND day >= ${String(args.from ?? '1900-01-01')}::date`;
          ids = rows.map((r) => String(r.id));
        }
        if (!ids.length) throw new ToolError('Give ids, or plan_id (and from).');
        const moved = await moveSessions(sql, p(ctx), ids, Number(args.days));
        const onWatch = (await sql`SELECT id FROM training.sessions WHERE profile_id = ${p(ctx)} AND id = ANY(${ids}) AND sent_at IS NOT NULL`).map((r) => String(r.id));
        return { moved, on_watch_to_resend: onWatch };
      })
  },
  {
    name: 'delete_sessions',
    title: 'Delete sessions',
    readOnly: false,
    destructive: true,
    description: 'Delete sessions by id. Those that were on the watch come back as on_watch: remove them with health__remove_workout (ref "training:<id>").',
    input: { type: 'object', properties: { ids: { type: 'array', minItems: 1, maxItems: 500, items: { type: 'string' } } }, required: ['ids'] },
    run: (args, ctx) =>
      ctx.db(async (sql) => {
        const ids = (args.ids as string[]).map(String);
        const onWatch = (await sql`SELECT id FROM training.sessions WHERE profile_id = ${p(ctx)} AND id = ANY(${ids}) AND sent_at IS NOT NULL`).map((r) => String(r.id));
        return { deleted: await deleteSessions(sql, p(ctx), ids), on_watch: onWatch };
      })
  },
  {
    name: 'log_session',
    title: 'Log a session as done or skipped',
    readOnly: false,
    destructive: true,
    description:
      'Record how a session went: status done or skipped, result {exercises (the sets really done: reps, kg, seconds), rpe 0-10, note, ' +
      'started_at, finished_at}, and activity_ref (e.g. the Garmin activity id from health__activities). Without id it logs a new ' +
      'session (give day, sport, title), e.g. an unplanned gym workout.',
    input: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        status: { type: 'string', enum: ['done', 'skipped'] },
        result: { type: 'object' },
        activity_ref: { type: 'string', maxLength: 80 },
        day: DAY,
        sport: { type: 'string', enum: [...SPORTS] },
        title: { type: 'string', maxLength: 120 }
      },
      required: ['status']
    },
    run: (args, ctx) =>
      ctx.db(async (sql) => {
        const result = asResult(args.result);
        let id = args.id ? String(args.id) : '';
        if (!id) {
          const s: SessionInput = { day: (args.day as string) ?? todayIn(), sport: args.sport as string, title: args.title as string, exercises: result?.exercises ?? null };
          fail(sessionProblems(s, true));
          id = await insertSession(sql, p(ctx), s);
        }
        if (!(await logSession(sql, p(ctx), id, args.status as Status, result, (args.activity_ref as string) ?? null))) throw new ToolError(`No session ${id}.`);
        return { logged: id, status: args.status };
      })
  },
  {
    name: 'garmin_workout',
    title: 'The watch workout of a session',
    readOnly: true,
    description:
      'The exact arguments for health__send_workout that put this session on the Garmin watch (ref "training:<id>"; strength becomes one ' +
      'step per exercise). Call health__send_workout with them, then mark_sent. null when the sport has no Garmin workout.',
    input: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    run: (args, ctx) =>
      ctx.db(async (sql) => {
        const s = await sessionById(sql, p(ctx), String(args.id));
        if (!s) throw new ToolError(`No session ${args.id}.`);
        return { send_workout: garminWorkout(s), on_watch: !!s.sent_at };
      })
  },
  {
    name: 'mark_sent',
    title: 'Record that a session is on the watch',
    readOnly: false,
    description: 'After health__send_workout (sent true) or health__remove_workout (sent false): the page then shows it as on the watch, or not.',
    input: { type: 'object', properties: { id: { type: 'string' }, sent: { type: 'boolean' } }, required: ['id', 'sent'] },
    run: (args, ctx) =>
      ctx.db(async (sql) => {
        if (!(await setSent(sql, p(ctx), String(args.id), args.sent === true))) throw new ToolError(`No session ${args.id}.`);
        return { id: args.id, on_watch: args.sent === true };
      })
  },
  {
    name: 'save_template',
    title: 'Save a reusable workout',
    readOnly: false,
    description: 'A template ("Full body A", "Long run 90 min"): name, sport, description, steps or exercises. Give id to change one. Returns its id.',
    input: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        name: { type: 'string', minLength: 1, maxLength: 120 },
        sport: { type: 'string', enum: [...SPORTS] },
        description: { type: 'string', maxLength: 4000 },
        steps: STEPS,
        exercises: EXERCISES
      },
      required: ['name', 'sport']
    },
    run: (args, ctx) =>
      ctx.db(async (sql) => ({
        id: await saveTemplate(sql, p(ctx), {
          id: args.id as string | undefined,
          name: String(args.name).trim(),
          sport: String(args.sport),
          description: (args.description as string) ?? null,
          steps: args.steps,
          exercises: args.exercises
        })
      }))
  },
  {
    name: 'delete_template',
    title: 'Delete a reusable workout',
    readOnly: false,
    destructive: true,
    description: 'Delete a template; sessions made from it stay.',
    input: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    run: (args, ctx) =>
      ctx.db(async (sql) => {
        if (!(await deleteTemplate(sql, p(ctx), String(args.id)))) throw new ToolError(`No template ${args.id}.`);
        return { deleted: args.id };
      })
  }
];
