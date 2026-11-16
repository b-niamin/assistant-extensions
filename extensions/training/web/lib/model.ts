/**
 * The training model, pure (no DB). A workout (a session) is an ordered list of items: cardio (a run, a
 * ride, a swim: time, distance, optional blocks for the watch) and exercises from the library (sets of
 * reps, seconds or minutes, with kg). Checks of what the tools and the page send, the Garmin workout a
 * session becomes, lines to show. The same checks run for Claude (tools) and the page (actions).
 */
import { EN, type Translate } from '$shell';

export const SPORTS = ['running', 'cycling', 'swimming', 'strength', 'walking', 'hiking', 'mobility', 'yoga', 'rowing', 'skiing', 'other'] as const;
export type Sport = (typeof SPORTS)[number];
/** The sports a cardio item can have. */
export const CARDIO_SPORTS = ['running', 'cycling', 'swimming', 'walking', 'hiking', 'rowing', 'skiing', 'other'] as const;
export const STATUSES = ['planned', 'done', 'skipped'] as const;
export type Status = (typeof STATUSES)[number];
export const UNITS = ['reps', 'seconds', 'minutes'] as const;
export type Unit = (typeof UNITS)[number];

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
  /** A timed set (plank: seconds; sauna: minutes, stored as seconds). */
  seconds?: number;
  done?: boolean;
}
/** A structured step, as health__send_workout and Garmin take it. */
export type Step = Record<string, unknown>;

export interface CardioItem {
  kind: 'cardio';
  /** The library entry it came from. */
  ref?: string;
  sport: Sport;
  name?: string;
  duration_min?: number;
  distance_m?: number;
  /** Blocks for the watch: the step tree health__send_workout takes. */
  steps?: Step[];
  note?: string;
  done?: boolean;
}
export interface ExerciseItem {
  kind: 'exercise';
  ref?: string;
  name: string;
  unit: Unit;
  sets: SetSpec[];
  rest_s?: number;
  note?: string;
}
export type Item = CardioItem | ExerciseItem;

/** Before 1.1 a session had one sport and `exercises`; kept to read old rows and old tool calls. */
export interface Exercise {
  name: string;
  sets: SetSpec[];
  rest_s?: number;
  note?: string;
}

export interface SessionInput {
  plan_id?: string | null;
  day?: string;
  time_local?: string | null;
  title?: string;
  description?: string | null;
  duration_min?: number | null;
  items?: Item[] | null;
  status?: Status;
}

export interface Session {
  id: string;
  plan_id: string | null;
  day: string;
  time_local: string | null;
  /** The main sport: the first cardio item's, else strength (or other for recovery only). */
  sport: Sport;
  title: string;
  description: string | null;
  duration_min: number | null;
  items: Item[];
  status: Status;
  result: SessionResult | null;
  done_at: string | null;
  activity_ref: string | null;
  sent_at: string | null;
  source: string | null;
}

export interface SessionResult {
  rpe?: number;
  note?: string;
  started_at?: string;
  finished_at?: string;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
export const isDay = (v: unknown): v is string => typeof v === 'string' && DAY.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));

export const num = (v: unknown, min: number, max: number): number | undefined => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v.replace(',', '.')) : NaN;
  return Number.isFinite(n) && n >= min && n <= max ? Math.round(n * 100) / 100 : undefined;
};
const str = (v: unknown, max: number) => (v === undefined || v === null ? undefined : String(v).trim().slice(0, max));

function cleanSets(v: unknown): SetSpec[] {
  return (Array.isArray(v) ? v : []).slice(0, 30).map((s) => {
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
}

function cleanSteps(v: unknown): Step[] | undefined {
  if (!Array.isArray(v) || !v.length || v.length > 50) return undefined;
  if (JSON.stringify(v).length > 20000) return undefined;
  return v.filter((s) => s && typeof s === 'object') as Step[];
}

/** Items as stored: at most 40, names and numbers bounded; anything else is dropped. */
export function cleanItems(v: unknown): Item[] {
  if (!Array.isArray(v)) return [];
  const out: Item[] = [];
  for (const raw of v.slice(0, 40)) {
    if (!raw || typeof raw !== 'object') continue;
    const x = raw as Record<string, unknown>;
    const ref = str(x.ref, 40);
    const note = str(x.note, 300);
    if (x.kind === 'cardio' || (x.kind === undefined && x.sport !== undefined && x.sport !== 'strength' && !Array.isArray(x.sets))) {
      const it: CardioItem = { kind: 'cardio', sport: sportOf(x.sport) };
      if (ref) it.ref = ref;
      const name = str(x.name, 80);
      if (name) it.name = name;
      const min = num(x.duration_min, 1, 1440);
      if (min !== undefined) it.duration_min = Math.round(min);
      const dist = num(x.distance_m, 1, 1_000_000);
      if (dist !== undefined) it.distance_m = dist;
      const steps = cleanSteps(x.steps);
      if (steps) it.steps = steps;
      if (note) it.note = note;
      if (x.done === true) it.done = true;
      out.push(it);
      continue;
    }
    const name = str(x.name, 80);
    if (!name) continue;
    const sets = cleanSets(x.sets);
    const unit: Unit = UNITS.includes(x.unit as Unit) ? (x.unit as Unit) : sets.some((s) => s.seconds !== undefined && s.reps === undefined) ? 'seconds' : 'reps';
    const it: ExerciseItem = { kind: 'exercise', name, unit, sets };
    if (ref) it.ref = ref;
    const rest = num(x.rest_s, 0, 3600);
    if (rest !== undefined) it.rest_s = Math.round(rest);
    if (note) it.note = note;
    out.push(it);
  }
  return out;
}

/** Old exercises ([{name, sets}]) as exercise items. */
export const exercisesAsItems = (v: unknown): Item[] => cleanItems((Array.isArray(v) ? v : []).map((e) => ({ ...(e && typeof e === 'object' ? e : {}), kind: 'exercise' })));

/**
 * The items of a stored row: `items` when it has them, else what a session before 1.1 had (one sport with
 * steps, time, distance and/or exercises, the logged sets in result.exercises).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function itemsOf(r: any): Item[] {
  if (Array.isArray(r.items)) return cleanItems(r.items);
  const out: Item[] = [];
  const sport = sportOf(r.sport);
  if (sport !== 'strength') out.push(...cleanItems([{ kind: 'cardio', sport, steps: r.steps, distance_m: r.distance_m, duration_min: r.duration_min, done: r.status === 'done' }]));
  const logged = r.result && Array.isArray(r.result.exercises) && r.result.exercises.length ? r.result.exercises : r.exercises;
  out.push(...exercisesAsItems(logged));
  return out;
}

/** The main sport of a workout: its first cardio item's, else strength; recovery only (minutes) is other. */
export function mainSport(items: Item[]): Sport {
  const c = items.find((i): i is CardioItem => i.kind === 'cardio');
  if (c) return c.sport;
  if (items.some((i) => i.kind === 'exercise' && i.unit !== 'minutes')) return 'strength';
  return 'other';
}

/** A title from the items when none is given: "Run + Full body (5) + Sauna". */
export function autoTitle(items: Item[], t: Translate = EN): string {
  const names: string[] = [];
  let exercises = 0;
  for (const i of items) {
    if (i.kind === 'cardio') names.push(i.name ? t(i.name) : t(SPORT_LABELS[i.sport]));
    else if (i.unit === 'minutes') names.push(t(i.name));
    else if (!exercises++) names.push('');
  }
  const strength = items.filter((i): i is ExerciseItem => i.kind === 'exercise' && i.unit !== 'minutes');
  const title = names
    .map((n) => (n === '' ? (strength.length === 1 ? t(strength[0].name) : t('Strength ({n})', { n: strength.length })) : n))
    .join(' + ');
  return (title || t('Workout')).slice(0, 120);
}

/** Problems with a session's fields (all optional: `full` makes the day and a title or items required). */
export function sessionProblems(s: SessionInput, full: boolean): string[] {
  const p: string[] = [];
  if (full || s.day !== undefined) if (!isDay(s.day)) p.push('day: YYYY-MM-DD');
  const hasItems = Array.isArray(s.items) && s.items.length > 0;
  if (full && !hasItems && !(s.title && String(s.title).trim())) p.push('title or items: give at least one');
  if (s.title !== undefined && s.title !== null && String(s.title).length > 120) p.push('title: at most 120 characters');
  if (!full && s.title !== undefined && !String(s.title ?? '').trim()) p.push('title: 1-120 characters');
  if (s.time_local !== undefined && s.time_local !== null && s.time_local !== '' && !TIME.test(String(s.time_local))) p.push('time_local: HH:MM');
  if (s.description && String(s.description).length > 4000) p.push('description: at most 4000 characters');
  if (s.duration_min !== undefined && s.duration_min !== null && num(s.duration_min, 1, 1440) === undefined) p.push('duration_min: 1-1440');
  if (s.status !== undefined && !STATUSES.includes(s.status)) p.push(`status: one of ${STATUSES.join(', ')}`);
  if (s.items !== undefined && s.items !== null) {
    if (!Array.isArray(s.items) || s.items.length > 40) p.push('items: a list of at most 40');
    else if (JSON.stringify(s.items).length > 60000) p.push('items: too large');
    else if (cleanItems(s.items).length !== s.items.length) p.push('items: each needs kind cardio (with sport) or exercise (with name)');
  }
  return p;
}

/** The columns a SessionInput sets (only the given ones), cleaned. Items also set the main sport. */
export function sessionColumns(s: SessionInput): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (s.plan_id !== undefined) out.plan_id = s.plan_id || null;
  if (s.day !== undefined) out.day = s.day;
  if (s.time_local !== undefined) out.time_local = s.time_local || null;
  if (s.description !== undefined) out.description = str(s.description, 4000) || null;
  if (s.duration_min !== undefined) out.duration_min = s.duration_min === null ? null : Math.round(num(s.duration_min, 1, 1440)!);
  if (s.items !== undefined) {
    const items = cleanItems(s.items);
    out.items = items;
    out.sport = mainSport(items);
    out.steps = null;
    out.exercises = null;
    out.distance_m = null;
  }
  if (s.title !== undefined) out.title = String(s.title ?? '').trim().slice(0, 120);
  if ((s.title === undefined || !out.title) && s.items !== undefined) out.title = out.title || autoTitle(out.items as Item[]);
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

// -- lines to show ---------------------------------------------------------------------------------------

const same = (a: number[]) => a.length > 0 && a.every((x) => x === a[0]);
const mins = (s: number) => (s % 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : `${s / 60}`);

/** One line per exercise: "Squat 3x8 @ 60 kg", "Plank 3x45 s", "Sauna 3x12 min". */
export function exerciseLine(e: Exercise & { unit?: Unit }, t: Translate = EN): string {
  const sets = e.sets.length;
  const reps = e.sets.map((s) => s.reps).filter((r): r is number => typeof r === 'number' && r > 0);
  const secs = e.sets.map((s) => s.seconds).filter((r): r is number => typeof r === 'number' && r > 0);
  const kgs = e.sets.map((s) => s.kg).filter((r): r is number => typeof r === 'number' && r > 0);
  let what = '';
  if (e.unit === 'minutes' && secs.length) what = same(secs) ? (sets > 1 ? `${sets}x${mins(secs[0])} min` : `${mins(secs[0])} min`) : secs.map((s) => `${mins(s)} min`).join('/');
  else if (reps.length && e.unit !== 'seconds') what = same(reps) ? `${sets}x${reps[0]}` : reps.join('/');
  else if (secs.length) what = same(secs) ? `${sets}x${secs[0]} s` : secs.map((s) => `${s} s`).join('/');
  else if (sets) what = t('{n} sets', { n: sets });
  const kg = kgs.length ? (same(kgs) ? ` @ ${kgs[0]} kg` : ` @ ${Math.min(...kgs)}-${Math.max(...kgs)} kg`) : '';
  return `${t(e.name)}${what ? ` ${what}` : ''}${kg}`;
}

export const km = (m: number) => `${Math.round(m / 100) / 10} km`;

/** A cardio item in a line: "Run 10 km · 50 min" or its blocks. */
export function cardioLine(c: CardioItem, t: Translate = EN): string {
  const parts = [c.name ? t(c.name) : t(SPORT_LABELS[c.sport])];
  if (c.distance_m) parts.push(km(c.distance_m));
  if (c.duration_min) parts.push(`${c.duration_min} min`);
  const head = parts.join(' ');
  return c.steps?.length ? `${head}: ${stepsLine(c.steps, t)}` : head;
}

export const itemLine = (i: Item, t: Translate = EN) => (i.kind === 'cardio' ? cardioLine(i, t) : exerciseLine(i, t));
/** The whole workout in a line, for the calendar and Claude. */
export const itemsLine = (items: Item[], t: Translate = EN, max = 6) =>
  items.slice(0, max).map((i) => itemLine(i, t)).join(', ') + (items.length > max ? ', …' : '');

/** Minutes of a workout: its planned total, else the sum of what its items say (cardio time, timed sets). */
export function minutesOf(s: Pick<Session, 'duration_min' | 'items'>): number | null {
  if (s.duration_min) return s.duration_min;
  let n = 0;
  for (const i of s.items) {
    if (i.kind === 'cardio') n += i.duration_min ?? 0;
    else if (i.unit !== 'reps') n += i.sets.reduce((a, x) => a + (x.seconds ?? 0), 0) / 60;
  }
  return n ? Math.round(n) : null;
}

/** Done and all of the countable parts: sets of exercises, cardio items. */
export function progressOf(items: Item[]): { done: number; all: number } {
  let done = 0;
  let all = 0;
  for (const i of items) {
    if (i.kind === 'cardio') {
      all++;
      if (i.done) done++;
    } else {
      all += i.sets.length;
      done += i.sets.filter((x) => x.done).length;
    }
  }
  return { done, all };
}

/** A short, readable line of a structured step tree: "10 min warm-up · 5 x (100 m work, 1 min recovery) · 10 min cool-down". */
export function stepsLine(steps: Step[] | null | undefined, t: Translate = EN): string {
  if (!steps?.length) return '';
  const kind: Record<string, string> = { warmup: 'warm-up', cooldown: 'cool-down', work: 'work', recovery: 'recovery', rest: 'rest' };
  const one = (s: Step): string => {
    if (s.kind === 'repeat') return `${Number(s.repeats) || 1} x (${(Array.isArray(s.steps) ? (s.steps as Step[]) : []).map(one).join(', ')})`;
    const note = typeof s.note === 'string' && s.note ? ` ${s.note}` : '';
    const target = targetText(s.target);
    return `${stepLength(s, t)} ${t(kind[String(s.kind)] ?? String(s.kind))}${target ? ` ${target}` : ''}${note}`;
  };
  return steps.map(one).join(' · ');
}

export function stepLength(s: Step, t: Translate = EN): string {
  const v = Number(s.durationValue);
  if (s.durationType === 'time' && v > 0) return v % 60 ? `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}` : `${v / 60} min`;
  if (s.durationType === 'distance' && v > 0) return v >= 1000 ? km(v) : `${v} m`;
  if (s.durationType === 'calories' && v > 0) return `${v} kcal`;
  return t('lap');
}

// -- blocks (the steps editor) ---------------------------------------------------------------------------

/** "4:50" -> 290 (seconds per km), or undefined. */
export function parsePace(v: string): number | undefined {
  const m = /^\s*(\d{1,2}):([0-5]\d)\s*$/.exec(v);
  return m ? Number(m[1]) * 60 + Number(m[2]) : undefined;
}
export const paceText = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

/** A target as typed: "4:50-5:10" is a pace per km, "140-150" heart rate. */
export function parseTarget(v: string): Step | undefined {
  const [a, b] = v.split(/[-–]/).map((x) => x.trim());
  if (!a) return undefined;
  if (a.includes(':')) {
    const lo = parsePace(a);
    const hi = b ? parsePace(b) : lo;
    if (lo === undefined || hi === undefined) return undefined;
    // Faster pace = fewer seconds; low is the slow end Garmin shows first, as the tools take it.
    return { type: 'pace', low: Math.min(lo, hi), high: Math.max(lo, hi) };
  }
  const lo = num(a, 40, 230);
  const hi = b ? num(b, 40, 230) : lo;
  if (lo === undefined || hi === undefined) return undefined;
  return { type: 'hr', low: Math.min(lo, hi), high: Math.max(lo, hi) };
}
export function targetText(v: unknown): string {
  if (!v || typeof v !== 'object') return '';
  const x = v as Record<string, unknown>;
  const lo = Number(x.low);
  const hi = Number(x.high);
  if (!(lo > 0)) return '';
  if (x.type === 'pace') return lo === hi || !(hi > 0) ? `@ ${paceText(lo)}/km` : `@ ${paceText(lo)}-${paceText(hi)}/km`;
  if (x.type === 'hr') return lo === hi || !(hi > 0) ? `@ ${lo} bpm` : `@ ${lo}-${hi} bpm`;
  const unit = x.type === 'power' ? ' W' : x.type === 'cadence' ? ' spm' : '';
  return `@ ${lo}${hi > 0 && hi !== lo ? `-${hi}` : ''}${unit}`;
}
/** The target as typed back into the editor. */
export function targetInput(v: unknown): string {
  if (!v || typeof v !== 'object') return '';
  const x = v as Record<string, unknown>;
  const lo = Number(x.low);
  const hi = Number(x.high);
  if (x.type === 'pace' && lo > 0) return hi > 0 && hi !== lo ? `${paceText(lo)}-${paceText(hi)}` : paceText(lo);
  if (x.type === 'hr' && lo > 0) return hi > 0 && hi !== lo ? `${lo}-${hi}` : String(lo);
  return '';
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
    case 'skiing':
    case 'other':
      return 'other';
    default:
      return null;
  }
}

/**
 * The arguments of health__send_workout for a workout (Claude passes them on). A cardio item gives its
 * blocks, else one step of its distance or time, else an open step; an exercise one lap step with its
 * line as the note. Minutes items (sauna, stretching) stay off the watch and go in the note. The sport:
 * the cardio items' one sport, strength_training for exercises only, else other. Null when nothing is
 * left for the watch.
 */
export function garminWorkout(s: Pick<Session, 'id' | 'title' | 'day' | 'description' | 'items'>) {
  const onWatch = s.items.filter((i) => !(i.kind === 'exercise' && i.unit === 'minutes'));
  if (!onWatch.length) return null;
  const cardio = onWatch.filter((i): i is CardioItem => i.kind === 'cardio');
  const sports = new Set(cardio.map((c) => garminSport(c.sport)));
  const sport = !cardio.length ? 'strength_training' : sports.size === 1 && cardio.length === onWatch.length ? [...sports][0]! : 'other';
  const steps: Step[] = [];
  for (const i of onWatch) {
    if (i.kind === 'exercise') steps.push({ kind: 'work', durationType: 'lap', note: exerciseLine(i) });
    else if (i.steps?.length) steps.push(...i.steps);
    else if (i.distance_m) steps.push({ kind: 'work', durationType: 'distance', durationValue: i.distance_m, ...(cardio.length < onWatch.length || cardio.length > 1 ? { note: cardioLine(i) } : {}) });
    else if (i.duration_min) steps.push({ kind: 'work', durationType: 'time', durationValue: i.duration_min * 60, ...(cardio.length < onWatch.length || cardio.length > 1 ? { note: cardioLine(i) } : {}) });
    else steps.push({ kind: 'work', durationType: 'lap', note: cardioLine(i) });
  }
  const off = s.items.filter((i) => i.kind === 'exercise' && i.unit === 'minutes').map((i) => itemLine(i));
  const note = [s.description ?? '', off.length ? `+ ${off.join(', ')}` : ''].filter(Boolean).join('\n');
  return {
    ref: `training:${s.id}`,
    sport,
    title: s.title.slice(0, 80),
    day: s.day,
    steps: steps.slice(0, 50),
    ...(note ? { note: note.slice(0, 1000) } : {})
  };
}

/** Best set of each exercise over the logged workouts: heaviest kg (then most reps), for progress. */
export function bests(results: { day: string; items: Item[] }[]): { name: string; kg: number; reps: number; day: string }[] {
  const by = new Map<string, { name: string; kg: number; reps: number; day: string }>();
  for (const r of results) {
    // Once any set is ticked, only the ticked ones count; a workout logged by Claude has no ticks.
    const ticked = r.items.some((i) => i.kind === 'exercise' && i.sets.some((x) => x.done));
    for (const e of r.items) {
      if (e.kind !== 'exercise' || e.unit !== 'reps') continue;
      for (const s of e.sets) {
        if (ticked && !s.done) continue;
        const kg = s.kg ?? 0;
        const reps = s.reps ?? 0;
        if (!kg && !reps) continue;
        const key = e.name.toLowerCase();
        const cur = by.get(key);
        if (!cur || kg > cur.kg || (kg === cur.kg && reps > cur.reps)) by.set(key, { name: e.name, kg, reps, day: r.day });
      }
    }
  }
  return [...by.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Chart hue of an item: its sport's for cardio, magenta for strength, violet for recovery (minutes). */
export const itemHue = (i: Item): string => (i.kind === 'cardio' ? SPORT_HUES[i.sport] : i.unit === 'minutes' ? 'violet' : 'magenta');
