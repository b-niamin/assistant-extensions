/** Reads and writes of the training schema, as role ext_training, always for one profile. */
import type { Sql } from '$shell';
import { isPhoto } from './photos';
import { groupFor, LIBRARY, type LibraryEntry, type Muscle } from './library';
import { cleanItems, itemsOf, mainSport, sessionColumns, sportOf, UNITS, type Item, type Session, type SessionInput, type SessionResult, type Status, type Unit } from './model';

const iso = (v: unknown): string | null => (v instanceof Date ? v.toISOString() : v == null ? null : String(v));
const dayText = (v: unknown): string => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));
export const newId = (prefix: string) => `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

const SESSION_COLS = ['plan_id', 'day', 'time_local', 'sport', 'title', 'description', 'duration_min', 'distance_m', 'steps', 'exercises', 'items', 'status'] as const;
const JSON_COLS = new Set(['steps', 'exercises', 'items']);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toSession(r: any): Session {
  const items = itemsOf(r);
  const result = r.result ? { ...r.result } : null;
  if (result) delete result.exercises;
  return {
    id: String(r.id),
    plan_id: r.plan_id ?? null,
    day: dayText(r.day),
    time_local: r.time_local ?? null,
    sport: Array.isArray(r.items) ? mainSport(items) : sportOf(r.sport),
    title: String(r.title),
    description: r.description ?? null,
    duration_min: r.duration_min ?? null,
    items,
    status: r.status as Status,
    result: result && Object.keys(result).length ? (result as SessionResult) : null,
    done_at: iso(r.done_at),
    activity_ref: r.activity_ref ?? null,
    sent_at: iso(r.sent_at),
    source: r.source ?? null
  };
}

// -- plans ----------------------------------------------------------------------------------------------

export type PlanState = 'active' | 'waiting' | 'finished';
export interface Plan {
  id: string;
  name: string;
  goal: string | null;
  sport: string | null;
  start_day: string | null;
  end_day: string | null;
  /** The one plan whose workouts the week, the calendar and the tile show. */
  active: boolean;
  /** active; waiting (not started or set aside); finished (status done or archived). */
  state: PlanState;
  status: string;
  notes: string | null;
  sessions: number;
  done: number;
}

/** Every plan of the profile: the active one first, then the waiting ones, then the finished ones. */
export async function plans(sql: Sql, p: string): Promise<Plan[]> {
  const rows = await sql`
    SELECT pl.*, count(s.id)::int AS sessions, count(s.id) FILTER (WHERE s.status = 'done')::int AS done
      FROM training.plans pl LEFT JOIN training.sessions s ON s.plan_id = pl.id
     WHERE pl.profile_id = ${p}
     GROUP BY pl.id
     ORDER BY pl.active DESC, (pl.status = 'active') DESC, pl.start_day DESC NULLS LAST, pl.created_at DESC`;
  return rows.map((r) => ({
    id: String(r.id),
    name: String(r.name),
    goal: r.goal ?? null,
    sport: r.sport ?? null,
    start_day: r.start_day ? dayText(r.start_day) : null,
    end_day: r.end_day ? dayText(r.end_day) : null,
    active: !!r.active,
    state: r.active ? 'active' : r.status === 'active' ? 'waiting' : 'finished',
    status: String(r.status),
    notes: r.notes ?? null,
    sessions: r.sessions,
    done: r.done
  }));
}

export async function planExists(sql: Sql, p: string, id: string): Promise<boolean> {
  const [r] = await sql`SELECT 1 AS x FROM training.plans WHERE profile_id = ${p} AND id = ${id}`;
  return !!r;
}

/** Makes `id` the profile's one active plan (it is waiting again if it was finished); null: no active plan. */
export async function setActivePlan(sql: Sql, p: string, id: string | null): Promise<boolean> {
  if (id && !(await planExists(sql, p, id))) return false;
  await sql`UPDATE training.plans SET active = false, updated_at = now() WHERE profile_id = ${p} AND active AND id IS DISTINCT FROM ${id}`;
  if (id) await sql`UPDATE training.plans SET active = true, status = 'active', updated_at = now() WHERE profile_id = ${p} AND id = ${id}`;
  return true;
}

export interface PlanInput {
  name?: string;
  goal?: string | null;
  sport?: string | null;
  start_day?: string | null;
  end_day?: string | null;
  status?: string;
  notes?: string | null;
}

export async function insertPlan(sql: Sql, p: string, x: PlanInput & { name: string }, active: boolean): Promise<string> {
  const id = newId('p');
  await sql`
    INSERT INTO training.plans (id, profile_id, name, goal, sport, start_day, end_day, notes)
    VALUES (${id}, ${p}, ${x.name.trim()}, ${x.goal || null}, ${x.sport || null}, ${x.start_day || null}, ${x.end_day || null}, ${x.notes || null})`;
  if (active) await setActivePlan(sql, p, id);
  return id;
}

/** Changes the given fields; a plan that is finished (done, archived) stops being the active one. */
export async function updatePlan(sql: Sql, p: string, id: string, x: PlanInput): Promise<boolean> {
  const set: Record<string, unknown> = {};
  for (const k of ['name', 'goal', 'sport', 'start_day', 'end_day', 'status', 'notes'] as const) if (x[k] !== undefined) set[k] = x[k] === '' ? null : x[k];
  if (set.status && set.status !== 'active') set.active = false;
  if (!Object.keys(set).length) return planExists(sql, p, id);
  const rows = await sql`UPDATE training.plans SET ${sql(set as never)}, updated_at = now() WHERE profile_id = ${p} AND id = ${id} RETURNING id`;
  return rows.length > 0;
}

/** Deletes a plan; with_sessions also its workouts still planned (done ones are history and stay). */
export async function deletePlan(sql: Sql, p: string, id: string, withSessions: boolean) {
  const removed = withSessions
    ? (await sql`DELETE FROM training.sessions WHERE profile_id = ${p} AND plan_id = ${id} AND status = 'planned' RETURNING id, sent_at`).map((r) => ({ id: String(r.id), on_watch: !!r.sent_at }))
    : [];
  const rows = await sql`DELETE FROM training.plans WHERE profile_id = ${p} AND id = ${id} RETURNING id`;
  return rows.length ? removed : null;
}

// -- sessions -------------------------------------------------------------------------------------------

/**
 * Workouts from `from` to `to`. `visible`: only those of the active plan and those of no plan, as the
 * week, the calendar and the tile show them.
 */
export async function sessionsIn(
  sql: Sql,
  p: string,
  from: string,
  to: string,
  opts: { planId?: string; status?: string; limit?: number; visible?: boolean } = {}
): Promise<Session[]> {
  const rows = await sql`
    SELECT * FROM training.sessions
     WHERE profile_id = ${p} AND day BETWEEN ${from}::date AND ${to}::date
       ${opts.planId ? sql`AND plan_id = ${opts.planId}` : sql``}
       ${opts.status ? sql`AND status = ${opts.status}` : sql``}
       ${opts.visible ? sql`AND (plan_id IS NULL OR plan_id IN (SELECT id FROM training.plans WHERE profile_id = ${p} AND active))` : sql``}
     ORDER BY day, time_local NULLS LAST, created_at LIMIT ${opts.limit ?? 500}`;
  return rows.map(toSession);
}

/** Every workout of a plan, in order. */
export async function planSessions(sql: Sql, p: string, planId: string): Promise<Session[]> {
  const rows = await sql`SELECT * FROM training.sessions WHERE profile_id = ${p} AND plan_id = ${planId} ORDER BY day, time_local NULLS LAST, created_at LIMIT 1000`;
  return rows.map(toSession);
}

export async function sessionById(sql: Sql, p: string, id: string): Promise<Session | null> {
  const [r] = await sql`SELECT * FROM training.sessions WHERE profile_id = ${p} AND id = ${id}`;
  return r ? toSession(r) : null;
}

export async function insertSession(sql: Sql, p: string, s: SessionInput, extra: { id?: string; result?: SessionResult | null; source?: string } = {}): Promise<string> {
  const id = extra.id ?? newId('s');
  const c = sessionColumns({ items: [], ...s });
  const status = (c.status as Status | undefined) ?? 'planned';
  await sql`
    INSERT INTO training.sessions (id, profile_id, plan_id, day, time_local, sport, title, description, duration_min, items, status, result, done_at, source)
    VALUES (${id}, ${p}, ${(c.plan_id as string) ?? null}, ${c.day as string}, ${(c.time_local as string) ?? null}, ${c.sport as string},
            ${c.title as string}, ${(c.description as string) ?? null}, ${(c.duration_min as number) ?? null}, ${sql.json(c.items as never)}, ${status},
            ${extra.result ? sql.json(extra.result as never) : null}, ${status === 'done' ? sql`now()` : null}, ${extra.source ?? null})
    ON CONFLICT (id) DO NOTHING`;
  return id;
}

/** Changes only the given fields; returns false when there is no such session for the profile. */
export async function updateSession(sql: Sql, p: string, id: string, s: SessionInput): Promise<boolean> {
  const c = sessionColumns(s);
  const set: Record<string, unknown> = {};
  for (const k of SESSION_COLS) if (k in c) set[k] = JSON_COLS.has(k) && c[k] ? sql.json(c[k] as never) : c[k];
  if (!Object.keys(set).length) return !!(await sessionById(sql, p, id));
  const rows = await sql`
    UPDATE training.sessions SET ${sql(set as never)}, updated_at = now(),
           done_at = CASE WHEN ${(c.status as string) ?? null}::text = 'done' THEN coalesce(done_at, now())
                          WHEN ${(c.status as string) ?? null}::text IS NULL THEN done_at ELSE NULL END
     WHERE profile_id = ${p} AND id = ${id} RETURNING id`;
  return rows.length > 0;
}

/** Records how it went: the status, the result (rpe, note, times), and the items as done (ticked sets). */
export async function logSession(sql: Sql, p: string, id: string, status: Status, result: SessionResult | null, opts: { activityRef?: string | null; items?: Item[] } = {}): Promise<boolean> {
  const items = opts.items ? cleanItems(opts.items) : null;
  const rows = await sql`
    UPDATE training.sessions
       SET status = ${status}, result = ${result ? sql.json(result as never) : null},
           done_at = ${status === 'done' ? sql`coalesce(done_at, now())` : null},
           activity_ref = coalesce(${opts.activityRef ?? null}, activity_ref), updated_at = now()
           ${items ? sql`, items = ${sql.json(items as never)}, sport = ${mainSport(items)}, steps = NULL, exercises = NULL, distance_m = NULL` : sql``}
     WHERE profile_id = ${p} AND id = ${id} RETURNING id`;
  return rows.length > 0;
}

export async function deleteSessions(sql: Sql, p: string, ids: string[]): Promise<string[]> {
  const rows = await sql`DELETE FROM training.sessions WHERE profile_id = ${p} AND id = ANY(${ids}) RETURNING id`;
  return rows.map((r) => String(r.id));
}

export async function moveSessions(sql: Sql, p: string, ids: string[], days: number): Promise<number> {
  const rows = await sql`
    UPDATE training.sessions SET day = day + ${days}::int, updated_at = now()
     WHERE profile_id = ${p} AND id = ANY(${ids}) RETURNING id`;
  return rows.length;
}

export async function setSent(sql: Sql, p: string, id: string, sent: boolean): Promise<boolean> {
  const rows = await sql`UPDATE training.sessions SET sent_at = ${sent ? sql`now()` : null}, updated_at = now() WHERE profile_id = ${p} AND id = ${id} RETURNING id`;
  return rows.length > 0;
}

// -- templates ------------------------------------------------------------------------------------------

export interface Template {
  id: string;
  name: string;
  description: string | null;
  items: Item[];
}

export async function templates(sql: Sql, p: string): Promise<Template[]> {
  const rows = await sql`SELECT * FROM training.templates WHERE profile_id = ${p} ORDER BY used_at DESC NULLS LAST, name`;
  return rows.map((r) => ({ id: String(r.id), name: String(r.name), description: r.description ?? null, items: itemsOf(r) }));
}

export async function saveTemplate(sql: Sql, p: string, t: { id?: string; name: string; description?: string | null; items: unknown }): Promise<string> {
  const id = t.id ?? newId('t');
  // A template is a plan of the workout: nothing in it is done yet.
  const items = cleanItems(t.items).map((i) => (i.kind === 'cardio' ? { ...i, done: undefined } : { ...i, sets: i.sets.map((s) => ({ ...s, done: undefined })) }));
  const clean = JSON.parse(JSON.stringify(items));
  await sql`
    INSERT INTO training.templates (id, profile_id, name, sport, description, items)
    VALUES (${id}, ${p}, ${t.name}, ${mainSport(clean)}, ${t.description ?? null}, ${sql.json(clean as never)})
    ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, sport = EXCLUDED.sport, description = EXCLUDED.description,
      items = EXCLUDED.items, steps = NULL, exercises = NULL, updated_at = now()
    WHERE training.templates.profile_id = ${p}`;
  return id;
}

export async function templateById(sql: Sql, p: string, id: string): Promise<Template | null> {
  return (await templates(sql, p)).find((t) => t.id === id) ?? null;
}

export async function touchTemplate(sql: Sql, p: string, id: string): Promise<void> {
  await sql`UPDATE training.templates SET used_at = now() WHERE profile_id = ${p} AND id = ${id}`;
}

export async function deleteTemplate(sql: Sql, p: string, id: string): Promise<boolean> {
  return (await sql`DELETE FROM training.templates WHERE profile_id = ${p} AND id = ${id} RETURNING id`).length > 0;
}

/** Logged workouts with exercises, newest first, for progress (bests). */
export async function doneWorkouts(sql: Sql, p: string, limit = 200): Promise<{ id: string; day: string; title: string; items: Item[] }[]> {
  const rows = await sql`
    SELECT * FROM training.sessions
     WHERE profile_id = ${p} AND status = 'done' AND (sport = 'strength' OR items IS NOT NULL OR exercises IS NOT NULL)
     ORDER BY day DESC, done_at DESC NULLS LAST LIMIT ${limit}`;
  return rows.map((r) => ({ id: String(r.id), day: dayText(r.day), title: String(r.title), items: itemsOf(r) }));
}

// -- the library ----------------------------------------------------------------------------------------

export interface CustomEntryInput {
  id?: string;
  name: string;
  kind: 'cardio' | 'exercise';
  sport?: string | null;
  unit?: Unit | null;
  muscles?: string[];
  description?: string | null;
  cautions?: string[];
  /** A Free Exercise DB id; null takes the photo away, undefined keeps the one it has. */
  photo?: string | null;
}

/** The profile's own entries, as library entries. */
export async function customLibrary(sql: Sql, p: string): Promise<LibraryEntry[]> {
  const rows = await sql`SELECT * FROM training.library WHERE profile_id = ${p} ORDER BY name`;
  return rows.map((r) => {
    const muscles = ((r.muscles ?? []) as string[]).filter((m) => m) as Muscle[];
    const kind = r.kind === 'cardio' ? 'cardio' : 'exercise';
    const unit = UNITS.includes(r.unit) ? (r.unit as Unit) : 'reps';
    return {
      id: String(r.id),
      name: String(r.name),
      kind,
      ...(kind === 'cardio' ? { sport: sportOf(r.sport) } : { unit }),
      muscles,
      group: groupFor({ kind, unit, muscles }),
      ...(r.description ? { description: String(r.description) } : {}),
      ...(Array.isArray(r.cautions) && r.cautions.length ? { cautions: r.cautions.map(String) } : {}),
      ...(r.photo ? { photo: String(r.photo) } : {}),
      custom: true
    } satisfies LibraryEntry;
  });
}

/** Built-in and own entries together, own first. */
export async function fullLibrary(sql: Sql, p: string): Promise<LibraryEntry[]> {
  return [...(await customLibrary(sql, p)), ...LIBRARY];
}

export async function saveCustomEntry(sql: Sql, p: string, e: CustomEntryInput): Promise<string> {
  // Own ids start with x, so one never shadows a built-in entry.
  const id = e.id && /^x[a-z0-9]{4,40}$/.test(e.id) ? e.id : newId('x');
  const cautions = (e.cautions ?? []).map((c) => String(c).trim().slice(0, 200)).filter(Boolean).slice(0, 10);
  const photo = isPhoto(e.photo) ? e.photo : null;
  await sql`
    INSERT INTO training.library (id, profile_id, name, kind, sport, unit, muscles, description, cautions, photo)
    VALUES (${id}, ${p}, ${e.name.trim().slice(0, 80)}, ${e.kind}, ${e.kind === 'cardio' ? sportOf(e.sport) : null},
            ${e.kind === 'exercise' ? (e.unit ?? 'reps') : null}, ${e.muscles ?? []}, ${e.description?.trim().slice(0, 2000) || null},
            ${cautions.length ? sql.json(cautions as never) : null}, ${photo})
    ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, kind = EXCLUDED.kind, sport = EXCLUDED.sport, unit = EXCLUDED.unit,
      muscles = EXCLUDED.muscles, description = EXCLUDED.description, cautions = EXCLUDED.cautions,
      ${e.photo === undefined ? sql`` : sql`photo = EXCLUDED.photo,`} updated_at = now()
    WHERE training.library.profile_id = ${p}`;
  return id;
}

export async function deleteCustomEntry(sql: Sql, p: string, id: string): Promise<boolean> {
  return (await sql`DELETE FROM training.library WHERE profile_id = ${p} AND id = ${id} RETURNING id`).length > 0;
}

/** Own entry id -> its photo (a Free Exercise DB id), for the pictures on every page (+layout.server.ts). */
export async function ownPhotos(sql: Sql, p: string): Promise<Record<string, string>> {
  const rows = await sql`SELECT id, photo FROM training.library WHERE profile_id = ${p} AND photo IS NOT NULL`;
  return Object.fromEntries(rows.map((r) => [String(r.id), String(r.photo)]));
}
