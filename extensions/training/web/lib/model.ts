/**
 * The training model, pure (no DB): sports, checks of what the tools and forms send, the Garmin workout a
 * session becomes, the Gym Tracker import. The same checks run for Claude (tools) and the page (actions).
 */
import { EN, type Translate } from '$shell';

export const SPORTS = ['running', 'cycling', 'swimming', 'strength', 'walking', 'hiking', 'mobility', 'yoga', 'rowing', 'skiing', 'other'] as const;
export type Sport = (typeof SPORTS)[number];
export const STATUSES = ['planned', 'done', 'skipped'] as const;
export type Status = (typeof STATUSES)[number];

export const SPORT_LABELS: Record<Sport, string> = {
  running: 'Running',
  cycling: 'Cycling',
  swimming: 'Swimming',
  strength: 'Strength',
  walking: 'Walking',
  hiking: 'Hiking',
  mobility: 'Mobility',
  yoga: 'Yoga',
  rowing: 'Rowing',
  skiing: 'Skiing',
  other: 'Other'
};
/** Chart hue of a sport (app.css --hue-*). */
export const SPORT_HUES: Record<Sport, string> = {
  running: 'blue',
  cycling: 'orange',
  swimming: 'aqua',
  strength: 'magenta',
  walking: 'green',
  hiking: 'green',
  mobility: 'violet',
  yoga: 'violet',
  rowing: 'aqua',
  skiing: 'yellow',
  other: 'yellow'
};
export const sportOf = (v: unknown): Sport => (SPORTS.includes(v as Sport) ? (v as Sport) : 'other');

export interface SetSpec {
  reps?: number;
  kg?: number;
  /** A timed set (plank, hold). */
  seconds?: number;
  done?: boolean;
}
export interface Exercise {
  name: string;
  sets: SetSpec[];
  rest_s?: number;
  note?: string;
}
/** A structured step, as health__send_workout and Garmin take it. */
export type Step = Record<string, unknown>;

export interface SessionInput {
  plan_id?: string | null;
  day?: string;
  time_local?: string | null;
  sport?: string;
  title?: string;
  description?: string | null;
  duration_min?: number | null;
  distance_m?: number | null;
  steps?: Step[] | null;
  exercises?: Exercise[] | null;
  status?: Status;
}

export interface Session {
  id: string;
  plan_id: string | null;
  day: string;
  time_local: string | null;
  sport: Sport;
  title: string;
  description: string | null;
  duration_min: number | null;
  distance_m: number | null;
  steps: Step[] | null;
  exercises: Exercise[] | null;
  status: Status;
  result: SessionResult | null;
  done_at: string | null;
  activity_ref: string | null;
  sent_at: string | null;
  source: string | null;
}

export interface SessionResult {
  exercises?: Exercise[];
  rpe?: number;
  note?: string;
  started_at?: string;
  finished_at?: string;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
export const isDay = (v: unknown): v is string => typeof v === 'string' && DAY.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));

const num = (v: unknown, min: number, max: number): number | undefined => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v.replace(',', '.')) : NaN;
  return Number.isFinite(n) && n >= min && n <= max ? Math.round(n * 100) / 100 : undefined;
};
const str = (v: unknown, max: number) => (v === undefined || v === null ? undefined : String(v).trim().slice(0, max));

/** Exercises as stored: names kept, numbers bounded, at most 40 exercises of 30 sets. */
export function cleanExercises(v: unknown): Exercise[] | null {
  if (!Array.isArray(v)) return null;
  const out: Exercise[] = [];
  for (const e of v.slice(0, 40)) {
    if (!e || typeof e !== 'object') continue;
    const x = e as Record<string, unknown>;
    const name = str(x.name, 80);
    if (!name) continue;
    const sets = (Array.isArray(x.sets) ? x.sets : []).slice(0, 30).map((s) => {
      const r = (s && typeof s === 'object' ? s : {}) as Record<string, unknown>;
      const set: SetSpec = {};
      const reps = num(r.reps, 0, 1000);
      const kg = num(r.kg, 0, 1000);
      const seconds = num(r.seconds, 0, 36000);
      if (reps !== undefined) set.reps = Math.round(reps);
      if (kg !== undefined) set.kg = kg;
      if (seconds !== undefined) set.seconds = Math.round(seconds);
      if (r.done === true) set.done = true;
      return set;
    });
    const ex: Exercise = { name, sets };
    const rest = num(x.rest_s, 0, 3600);
    if (rest !== undefined) ex.rest_s = Math.round(rest);
    const note = str(x.note, 300);
    if (note) ex.note = note;
    out.push(ex);
  }
  return out;
}

/** Problems with a session's fields (all optional: `full` makes day, sport and title required). */
export function sessionProblems(s: SessionInput, full: boolean): string[] {
  const p: string[] = [];
  if (full || s.day !== undefined) if (!isDay(s.day)) p.push('day: YYYY-MM-DD');
  if (full || s.sport !== undefined) if (!SPORTS.includes(s.sport as Sport)) p.push(`sport: one of ${SPORTS.join(', ')}`);
  if (full || s.title !== undefined) if (!s.title || !String(s.title).trim() || String(s.title).length > 120) p.push('title: 1-120 characters');
  if (s.time_local !== undefined && s.time_local !== null && s.time_local !== '' && !TIME.test(String(s.time_local))) p.push('time_local: HH:MM');
  if (s.description && String(s.description).length > 4000) p.push('description: at most 4000 characters');
  if (s.duration_min !== undefined && s.duration_min !== null && num(s.duration_min, 1, 1440) === undefined) p.push('duration_min: 1-1440');
  if (s.distance_m !== undefined && s.distance_m !== null && num(s.distance_m, 1, 1_000_000) === undefined) p.push('distance_m: 1-1000000');
  if (s.status !== undefined && !STATUSES.includes(s.status)) p.push(`status: one of ${STATUSES.join(', ')}`);
  if (s.steps !== undefined && s.steps !== null && (!Array.isArray(s.steps) || s.steps.length > 50 || JSON.stringify(s.steps).length > 20000)) p.push('steps: a list of at most 50 steps');
  if (s.exercises !== undefined && s.exercises !== null && !Array.isArray(s.exercises)) p.push('exercises: a list');
  return p;
}

/** The columns a SessionInput sets (only the given ones), cleaned. */
export function sessionColumns(s: SessionInput): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (s.plan_id !== undefined) out.plan_id = s.plan_id || null;
  if (s.day !== undefined) out.day = s.day;
  if (s.time_local !== undefined) out.time_local = s.time_local || null;
  if (s.sport !== undefined) out.sport = s.sport;
  if (s.title !== undefined) out.title = String(s.title).trim();
  if (s.description !== undefined) out.description = str(s.description, 4000) || null;
  if (s.duration_min !== undefined) out.duration_min = s.duration_min === null ? null : Math.round(num(s.duration_min, 1, 1440)!);
  if (s.distance_m !== undefined) out.distance_m = s.distance_m === null ? null : num(s.distance_m, 1, 1_000_000)!;
  if (s.steps !== undefined) out.steps = s.steps && s.steps.length ? s.steps : null;
  if (s.exercises !== undefined) out.exercises = cleanExercises(s.exercises);
  if (s.status !== undefined) out.status = s.status;
  return out;
}

/** Day arithmetic on YYYY-MM-DD, in UTC so a DST change never shifts it. */
export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function mondayOf(day: string): string {
  const dow = (new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7;
  return addDays(day, -dow);
}

// -- Garmin ---------------------------------------------------------------------------------------------

/** The sport health__send_workout takes for ours, or null when the watch has no workout for it. */
export function garminSport(s: Sport): string | null {
  switch (s) {
    case 'running':
      return 'running';
    case 'cycling':
      return 'cycling';
    case 'swimming':
      return 'swimming';
    case 'strength':
      return 'strength_training';
    case 'walking':
    case 'hiking':
      return 'walking';
    case 'mobility':
    case 'yoga':
    case 'rowing':
    case 'other':
      return 'other';
    default:
      return null;
  }
}

/** One line per exercise: "Squat 3x8 @ 60 kg", "Plank 3x45 s". */
export function exerciseLine(e: Exercise): string {
  const sets = e.sets.length;
  const reps = e.sets.map((s) => s.reps).filter((r): r is number => typeof r === 'number' && r > 0);
  const secs = e.sets.map((s) => s.seconds).filter((r): r is number => typeof r === 'number' && r > 0);
  const kgs = e.sets.map((s) => s.kg).filter((r): r is number => typeof r === 'number' && r > 0);
  const same = (a: number[]) => a.length && a.every((x) => x === a[0]);
  let what = '';
  if (reps.length) what = same(reps) ? `${sets}x${reps[0]}` : reps.join('/');
  else if (secs.length) what = same(secs) ? `${sets}x${secs[0]} s` : secs.map((s) => `${s} s`).join('/');
  else if (sets) what = `${sets} sets`;
  const kg = kgs.length ? (same(kgs) ? ` @ ${kgs[0]} kg` : ` @ ${Math.min(...kgs)}-${Math.max(...kgs)} kg`) : '';
  return `${e.name}${what ? ` ${what}` : ''}${kg}`;
}

/**
 * The arguments of health__send_workout for a session (Claude passes them on). Endurance with steps: those
 * steps. Strength: one lap step per exercise with its line as the note. Else: one step of its duration or
 * distance, or one open step. Null when the sport has no Garmin workout.
 */
export function garminWorkout(s: Pick<Session, 'id' | 'sport' | 'title' | 'day' | 'description' | 'steps' | 'exercises' | 'duration_min' | 'distance_m'>) {
  const sport = garminSport(s.sport);
  if (!sport) return null;
  let steps: Step[];
  if (s.steps?.length) steps = s.steps;
  else if (s.exercises?.length) steps = s.exercises.map((e) => ({ kind: 'work', durationType: 'lap', note: exerciseLine(e) }));
  else if (s.distance_m) steps = [{ kind: 'work', durationType: 'distance', durationValue: s.distance_m }];
  else if (s.duration_min) steps = [{ kind: 'work', durationType: 'time', durationValue: s.duration_min * 60 }];
  else steps = [{ kind: 'work', durationType: 'lap' }];
  return {
    ref: `training:${s.id}`,
    sport,
    title: s.title.slice(0, 80),
    day: s.day,
    steps,
    ...(s.description ? { note: s.description.slice(0, 1000) } : {})
  };
}

/** A short, readable line of a structured step tree: "10 min warm-up · 5 x (100 m work, 1:00 recovery) · 10 min cool-down". */
export function stepsLine(steps: Step[] | null, t: Translate = EN): string {
  if (!steps?.length) return '';
  const len = (s: Step) => {
    const v = Number(s.durationValue);
    if (s.durationType === 'time' && v > 0) return v % 60 ? `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}` : `${v / 60} min`;
    if (s.durationType === 'distance' && v > 0) return v >= 1000 ? `${Math.round(v / 100) / 10} km` : `${v} m`;
    if (s.durationType === 'calories' && v > 0) return `${v} kcal`;
    return t('lap');
  };
  const kind: Record<string, string> = { warmup: 'warm-up', cooldown: 'cool-down', work: 'work', recovery: 'recovery', rest: 'rest' };
  const one = (s: Step): string => {
    if (s.kind === 'repeat') return `${Number(s.repeats) || 1} x (${(Array.isArray(s.steps) ? (s.steps as Step[]) : []).map(one).join(', ')})`;
    const note = typeof s.note === 'string' && s.note ? ` ${s.note}` : '';
    return `${len(s)} ${t(kind[String(s.kind)] ?? String(s.kind))}${note}`;
  };
  return steps.map(one).join(' · ');
}

// -- Gym Tracker import ------------------------------------------------------------------------------------

interface GymSet {
  kg?: string;
  reps?: string;
  done?: boolean;
}
interface GymExercise {
  name?: string;
  type?: 't' | 'w';
  note?: string;
  sets?: GymSet[];
}
interface GymDoc {
  kind?: string;
  name?: string;
  date?: string;
  done?: boolean;
  sample?: boolean;
  planName?: string;
  startedAt?: number | null;
  finishedAt?: number | null;
  exercises?: GymExercise[];
}

const gymExercises = (list: GymExercise[] | undefined, onlyDone: boolean): Exercise[] =>
  cleanExercises(
    (list ?? []).map((e) => ({
      name: e.name,
      note: e.note,
      sets: (e.sets ?? [])
        .filter((s) => !onlyDone || s.done || Number(s.reps) > 0)
        .map((s) => (e.type === 't' ? { seconds: s.reps, kg: s.kg, done: onlyDone || s.done } : { reps: s.reps, kg: s.kg, done: onlyDone || s.done }))
    }))
  ) ?? [];

/**
 * The Gym Tracker's saved document (gym__read_data, key gym-notebook.v1: {docs: {id: workout | plan}})
 * as training rows: each workout a strength session (done when finished there), each plan a template.
 * Ids keep the gym ids ("gym-<id>"), so importing twice changes nothing. Example data is left out.
 */
export function fromGym(doc: unknown): { sessions: (SessionInput & { id: string; result: SessionResult | null; source: string })[]; templates: { id: string; name: string; exercises: Exercise[] }[] } {
  const docs = ((doc && typeof doc === 'object' && 'docs' in doc ? (doc as { docs: unknown }).docs : doc) ?? {}) as Record<string, GymDoc>;
  const sessions: ReturnType<typeof fromGym>['sessions'] = [];
  const templates: ReturnType<typeof fromGym>['templates'] = [];
  for (const [id, d] of Object.entries(docs)) {
    if (!d || typeof d !== 'object' || d.sample) continue;
    const safeId = `gym-${String(id).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 60)}`;
    if (d.kind === 'plan') {
      const name = str(d.name, 120);
      if (name) templates.push({ id: safeId, name, exercises: gymExercises(d.exercises, false) });
      continue;
    }
    if (d.kind || !isDay(d.date)) continue;
    const done = gymExercises(d.exercises, true).filter((e) => e.sets.length);
    const timed = typeof d.startedAt === 'number' && typeof d.finishedAt === 'number' && d.finishedAt >= d.startedAt;
    sessions.push({
      id: safeId,
      day: d.date,
      sport: 'strength',
      title: str(d.planName, 120) || 'Workout',
      exercises: gymExercises(d.exercises, false),
      status: d.done ? 'done' : 'planned',
      duration_min: timed ? Math.max(1, Math.min(1440, Math.round(((d.finishedAt as number) - (d.startedAt as number)) / 60000))) : null,
      result: d.done || done.length
        ? {
            exercises: done,
            ...(timed ? { started_at: new Date(d.startedAt as number).toISOString(), finished_at: new Date(d.finishedAt as number).toISOString() } : {})
          }
        : null,
      source: 'gym'
    });
  }
  return { sessions, templates };
}

/** Best set of each exercise over the logged sessions: heaviest kg (then most reps), for progress. */
export function bests(results: { day: string; exercises: Exercise[] }[]): { name: string; kg: number; reps: number; day: string }[] {
  const by = new Map<string, { name: string; kg: number; reps: number; day: string }>();
  for (const r of results)
    for (const e of r.exercises)
      for (const s of e.sets) {
        const kg = s.kg ?? 0;
        const reps = s.reps ?? 0;
        if (!kg && !reps) continue;
        const key = e.name.toLowerCase();
        const cur = by.get(key);
        if (!cur || kg > cur.kg || (kg === cur.kg && reps > cur.reps)) by.set(key, { name: e.name, kg, reps, day: r.day });
      }
  return [...by.values()].sort((a, b) => a.name.localeCompare(b.name));
}
