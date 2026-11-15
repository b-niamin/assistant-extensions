/** Reads and writes of the training schema, as role ext_training, always for one profile. */
import type { Sql } from '$shell';
import { cleanExercises, sessionColumns, sportOf, type Exercise, type Session, type SessionInput, type SessionResult, type Status } from './model';

const iso = (v: unknown): string | null => (v instanceof Date ? v.toISOString() : v == null ? null : String(v));
const dayText = (v: unknown): string => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));
export const newId = (prefix: string) => `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

const SESSION_COLS = ['plan_id', 'day', 'time_local', 'sport', 'title', 'description', 'duration_min', 'distance_m', 'steps', 'exercises', 'status'] as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toSession(r: any): Session {
  return {
    id: String(r.id),
    plan_id: r.plan_id ?? null,
    day: dayText(r.day),
    time_local: r.time_local ?? null,
    sport: sportOf(r.sport),
    title: String(r.title),
    description: r.description ?? null,
    duration_min: r.duration_min ?? null,
    distance_m: r.distance_m ?? null,
    steps: r.steps ?? null,
    exercises: r.exercises ?? null,
    status: r.status as Status,
    result: r.result ?? null,
    done_at: iso(r.done_at),
    activity_ref: r.activity_ref ?? null,
    sent_at: iso(r.sent_at),
    source: r.source ?? null
  };
}

export interface Plan {
  id: string;
  name: string;
  goal: string | null;
  sport: string | null;
  start_day: string | null;
  end_day: string | null;
  status: string;
  notes: string | null;
  sessions: number;
  done: number;
}

export async function plans(sql: Sql, p: string, opts: { all?: boolean } = {}): Promise<Plan[]> {
  const rows = await sql`
    SELECT pl.*, count(s.id)::int AS sessions, count(s.id) FILTER (WHERE s.status = 'done')::int AS done
      FROM training.plans pl LEFT JOIN training.sessions s ON s.plan_id = pl.id
     WHERE pl.profile_id = ${p} ${opts.all ? sql`` : sql`AND pl.status = 'active'`}
     GROUP BY pl.id ORDER BY pl.start_day NULLS LAST, pl.created_at`;
  return rows.map((r) => ({
    id: String(r.id),
    name: String(r.name),
    goal: r.goal ?? null,
    sport: r.sport ?? null,
    start_day: r.start_day ? dayText(r.start_day) : null,
    end_day: r.end_day ? dayText(r.end_day) : null,
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

export async function sessionsIn(sql: Sql, p: string, from: string, to: string, opts: { planId?: string; status?: string; limit?: number } = {}): Promise<Session[]> {
  const rows = await sql`
    SELECT * FROM training.sessions
     WHERE profile_id = ${p} AND day BETWEEN ${from}::date AND ${to}::date
       ${opts.planId ? sql`AND plan_id = ${opts.planId}` : sql``}
       ${opts.status ? sql`AND status = ${opts.status}` : sql``}
     ORDER BY day, time_local NULLS LAST, created_at LIMIT ${opts.limit ?? 500}`;
  return rows.map(toSession);
}

export async function sessionById(sql: Sql, p: string, id: string): Promise<Session | null> {
  const [r] = await sql`SELECT * FROM training.sessions WHERE profile_id = ${p} AND id = ${id}`;
  return r ? toSession(r) : null;
}

export async function insertSession(sql: Sql, p: string, s: SessionInput, extra: { id?: string; result?: SessionResult | null; source?: string } = {}): Promise<string> {
  const id = extra.id ?? newId('s');
  const c = sessionColumns(s);
  const status = (c.status as Status | undefined) ?? 'planned';
  await sql`
    INSERT INTO training.sessions (id, profile_id, plan_id, day, time_local, sport, title, description, duration_min, distance_m,
                                   steps, exercises, status, result, done_at, source)
    VALUES (${id}, ${p}, ${(c.plan_id as string) ?? null}, ${c.day as string}, ${(c.time_local as string) ?? null}, ${c.sport as string},
            ${c.title as string}, ${(c.description as string) ?? null}, ${(c.duration_min as number) ?? null}, ${(c.distance_m as number) ?? null},
            ${c.steps ? sql.json(c.steps as never) : null}, ${c.exercises ? sql.json(c.exercises as never) : null}, ${status},
            ${extra.result ? sql.json(extra.result as never) : null}, ${status === 'done' ? sql`now()` : null}, ${extra.source ?? null})
    ON CONFLICT (id) DO NOTHING`;
  return id;
}

/** Changes only the given fields; returns false when there is no such session for the profile. */
export async function updateSession(sql: Sql, p: string, id: string, s: SessionInput): Promise<boolean> {
  const c = sessionColumns(s);
  const set: Record<string, unknown> = {};
  for (const k of SESSION_COLS) if (k in c) set[k] = (k === 'steps' || k === 'exercises') && c[k] ? sql.json(c[k] as never) : c[k];
  if (!Object.keys(set).length) return !!(await sessionById(sql, p, id));
  const rows = await sql`
    UPDATE training.sessions SET ${sql(set as never)}, updated_at = now(),
           done_at = CASE WHEN ${(c.status as string) ?? null}::text = 'done' THEN coalesce(done_at, now())
                          WHEN ${(c.status as string) ?? null}::text IS NULL THEN done_at ELSE NULL END
     WHERE profile_id = ${p} AND id = ${id} RETURNING id`;
  return rows.length > 0;
}

export async function logSession(sql: Sql, p: string, id: string, status: Status, result: SessionResult | null, activityRef?: string | null): Promise<boolean> {
  const rows = await sql`
    UPDATE training.sessions
       SET status = ${status}, result = ${result ? sql.json(result as never) : null},
           done_at = ${status === 'done' ? sql`coalesce(done_at, now())` : null},
           activity_ref = coalesce(${activityRef ?? null}, activity_ref), updated_at = now()
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
  sport: string;
  description: string | null;
  steps: unknown;
  exercises: Exercise[] | null;
}

export async function templates(sql: Sql, p: string): Promise<Template[]> {
  const rows = await sql`SELECT * FROM training.templates WHERE profile_id = ${p} ORDER BY used_at DESC NULLS LAST, name`;
  return rows.map((r) => ({ id: String(r.id), name: String(r.name), sport: String(r.sport), description: r.description ?? null, steps: r.steps ?? null, exercises: r.exercises ?? null }));
}

export async function saveTemplate(sql: Sql, p: string, t: { id?: string; name: string; sport: string; description?: string | null; steps?: unknown; exercises?: unknown }): Promise<string> {
  const id = t.id ?? newId('t');
  const ex = cleanExercises(t.exercises);
  await sql`
    INSERT INTO training.templates (id, profile_id, name, sport, description, steps, exercises)
    VALUES (${id}, ${p}, ${t.name}, ${t.sport}, ${t.description ?? null}, ${t.steps ? sql.json(t.steps as never) : null}, ${ex ? sql.json(ex as never) : null})
    ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, sport = EXCLUDED.sport, description = EXCLUDED.description,
      steps = EXCLUDED.steps, exercises = EXCLUDED.exercises, updated_at = now()
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

/** Logged strength results, newest first, for progress (bests) and the overview. */
export async function strengthResults(sql: Sql, p: string, limit = 200): Promise<{ day: string; title: string; exercises: Exercise[] }[]> {
  const rows = await sql`
    SELECT day, title, coalesce(result->'exercises', exercises) AS ex FROM training.sessions
     WHERE profile_id = ${p} AND status = 'done' AND sport = 'strength'
     ORDER BY day DESC LIMIT ${limit}`;
  return rows.map((r) => ({ day: dayText(r.day), title: String(r.title), exercises: cleanExercises(r.ex) ?? [] }));
}
