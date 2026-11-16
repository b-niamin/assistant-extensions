/**
 * The gym side of a workout, as Piotr's gym log did it: what was done last time, records, quick fills,
 * muscles worked, recovery, the plate calculator, the pictures. Pure functions, shared by the pages.
 */
import { libraryById, MUSCLES, type LibraryEntry, type Muscle } from './library';
import type { ExerciseItem, Item, SetSpec, Unit } from './model';

const files = import.meta.glob('./img/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
/** The photo of an exercise: start (0) or end (1) of the movement (Free Exercise DB, public domain). */
export const imageOf = (id: string | undefined, frame: 0 | 1 = 0): string | undefined => (id ? files[`./img/${id}_${frame}.webp`] : undefined);

/** Rest between sets, in seconds, by exercise (90 for the rest). */
export const REST: Record<string, number> = {
  bench: 150, squat: 180, deadlift: 180, rdl: 150, ohp: 150, bbrow: 120, hipthrust: 120, legpress: 150, pulldown: 120, cablerow: 120,
  inclinedb: 120, dips: 120, pullup: 120, lunge: 120, latpull_close: 120, plank: 60, kneeraise: 60, kbpass: 60, halo: 60, swimmers: 60,
  catcamel: 45, birddog: 60, deadbug: 60, sideplank: 45, glutebridge: 60, hipflexor: 30, hyper: 90
};
export const restFor = (ref: string | undefined): number => (ref && REST[ref]) || 90;
/** Barbell lifts: the plate calculator, +2.5 kg steps. */
export const BAR = new Set(['bench', 'squat', 'deadlift', 'rdl', 'ohp', 'bbrow', 'hipthrust', 'bbcurl']);
/** Two dumbbells: the weight typed is both together. */
export const PAIR = new Set(['lateral', 'inclinedb', 'lunge', 'dbcurl']);
/** Plates: kg, colour, height in the drawing. */
export const PLATES: [number, string, number][] = [
  [25, '#D23A2E', 100], [20, '#1F5FC4', 100], [15, '#E9B713', 90], [10, '#2F9A57', 80],
  [5, '#F3F3EF', 62], [2.5, '#1B2130', 52], [1.25, '#8A919E', 44], [0.5, '#C9CCD2', 38]
];

/** What identifies an exercise across workouts: its library entry, else its name. */
export const keyOf = (i: { ref?: string; name?: string }): string => i.ref || `c:${(i.name ?? '').trim().toLowerCase()}`;

/** The number a set counts: reps, or seconds for timed sets. */
export const amount = (s: SetSpec, unit: Unit): number => (unit === 'reps' ? (s.reps ?? 0) : (s.seconds ?? 0));
export const e1rm = (kg: number, r: number) => (r > 0 && kg > 0 ? (r === 1 ? kg : kg * (1 + r / 30)) : 0);

/** A logged workout as the history reads it. */
export interface Logged {
  id: string;
  day: string;
  items: Item[];
}
export interface Perf {
  day: string;
  unit: Unit;
  sets: SetSpec[];
  note?: string;
}

/** The sets that count in a logged exercise: the ticked ones once any is ticked, else those with a value. */
export function counted(e: ExerciseItem): SetSpec[] {
  const ticked = e.sets.some((s) => s.done);
  return e.sets.filter((s) => (!ticked || s.done) && amount(s, e.unit) > 0);
}

const exercisesOf = (w: Logged, key: string) => w.items.filter((i): i is ExerciseItem => i.kind === 'exercise' && keyOf(i) === key);

/** The last time an exercise was done (history newest first), leaving out one workout. */
export function lastPerf(history: Logged[], key: string, exclude?: string): Perf | null {
  for (const w of history) {
    if (w.id === exclude) continue;
    for (const e of exercisesOf(w, key)) {
      const sets = counted(e);
      if (sets.length) return { day: w.day, unit: e.unit, sets, note: e.note };
    }
  }
  return null;
}

/** The best before: estimated 1RM for weighted sets, the most reps (or seconds) for the others. */
export function bestBefore(history: Logged[], key: string, exclude?: string): { e1rm: number; amount: number } {
  let best = 0;
  let most = 0;
  for (const w of history) {
    if (w.id === exclude) continue;
    for (const e of exercisesOf(w, key))
      for (const s of counted(e)) {
        best = Math.max(best, e1rm(s.kg ?? 0, s.reps ?? 0));
        most = Math.max(most, amount(s, e.unit));
      }
  }
  return { e1rm: best, amount: most };
}

/** Is this ticked set a record against the history and the other ticked sets of the exercise? */
export function isRecord(e: ExerciseItem, j: number, best: { e1rm: number; amount: number }): boolean {
  const s = e.sets[j];
  if (!s?.done || !amount(s, e.unit)) return false;
  if (e.unit !== 'reps' || !s.kg) return best.amount > 0 && amount(s, e.unit) > best.amount;
  return best.e1rm > 0 && e1rm(s.kg, s.reps ?? 0) > best.e1rm + 0.01;
}

export interface HistoryRow {
  day: string;
  maxKg: number;
  e1rm: number;
  vol: number;
  maxR: number;
  sumR: number;
  all: SetSpec[];
  unit: Unit;
}
export type Metric = 'e1rm' | 'maxKg' | 'vol' | 'maxR' | 'sumR';

/** Every logged session of an exercise, oldest first, with what the progress chart shows. */
export function historyOf(history: Logged[], key: string): HistoryRow[] {
  const out: HistoryRow[] = [];
  for (const w of [...history].reverse()) {
    const e = exercisesOf(w, key)[0];
    if (!e) continue;
    const ss = counted(e);
    if (!ss.length) continue;
    let maxKg = 0, best = 0, vol = 0, maxR = 0, sumR = 0;
    for (const s of ss) {
      const kg = s.kg ?? 0;
      const r = amount(s, e.unit);
      maxKg = Math.max(maxKg, kg);
      maxR = Math.max(maxR, r);
      sumR += r;
      if (e.unit === 'reps') {
        best = Math.max(best, e1rm(kg, r));
        vol += kg * r;
      }
    }
    out.push({ day: w.day, maxKg, e1rm: best, vol, maxR, sumR, all: ss, unit: e.unit });
  }
  return out;
}

/** When each exercise was last done: key, day. */
export function usedOn(history: Logged[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const w of history) for (const i of w.items) if (i.kind === 'exercise' && !m.has(keyOf(i)) && counted(i).length) m.set(keyOf(i), w.day);
  return m;
}

/**
 * Sets per muscle in workouts: primary muscles count a set, secondary half. mode done: ticked sets only;
 * plan: every set; logged: what counts in a logged workout.
 */
export function muscleLoad(items: Item[], mode: 'done' | 'plan' | 'logged', lib: LibraryEntry[] = []): Partial<Record<Muscle, number>> {
  const m: Partial<Record<Muscle, number>> = {};
  for (const i of items) {
    if (i.kind !== 'exercise' || !i.ref) continue;
    const l = libraryById(i.ref, lib);
    if (!l?.muscles?.length) continue;
    const n = mode === 'done' ? i.sets.filter((s) => s.done && amount(s, i.unit) > 0).length : mode === 'plan' ? i.sets.length : counted(i).length;
    if (!n) continue;
    for (const k of l.muscles) m[k] = (m[k] ?? 0) + n;
    for (const k of l.also ?? []) m[k] = (m[k] ?? 0) + n * 0.5;
  }
  return m;
}

/** Days since each muscle was last trained (history of done workouts). */
export function recovery(history: Logged[], today: string, lib: LibraryEntry[] = []): Partial<Record<Muscle, number>> {
  const r: Partial<Record<Muscle, number>> = {};
  const t = Date.parse(`${today}T12:00:00Z`);
  for (const w of history) {
    const d = Math.round((t - Date.parse(`${w.day}T12:00:00Z`)) / 864e5);
    for (const i of w.items) {
      if (i.kind !== 'exercise' || !i.ref || !counted(i).length) continue;
      const l = libraryById(i.ref, lib);
      for (const k of [...(l?.muscles ?? []), ...(l?.also ?? [])]) if (r[k] == null || d < r[k]!) r[k] = d;
    }
  }
  return r;
}
export const MUSCLE_IDS = Object.keys(MUSCLES) as Muscle[];

/** How much heavier the next step is. */
export function stepFor(ref: string | undefined, top: number): number {
  if (ref && PAIR.has(ref)) return 2;
  if (ref && BAR.has(ref)) return 2.5;
  return Math.max(1, Math.round(top * 0.05 * 2) / 2);
}

export interface QuickOption {
  id: 'same' | 'kg' | 'reps' | 't5' | 't10';
  /** kg added (kg), seconds added (t5, t10). */
  by?: number;
  sets: SetSpec[];
}
/** Fill the sets from last time: the same, a step heavier, one more rep (or 5 / 10 s longer). */
export function quickOptions(e: ExerciseItem, prev: Perf): QuickOption[] {
  const ps = prev.sets;
  const r2 = (n: number) => Math.round(n * 100) / 100;
  if (e.unit !== 'reps')
    return [
      { id: 'same', sets: ps.map((s) => ({ seconds: s.seconds })) },
      { id: 't5', by: 5, sets: ps.map((s) => ({ seconds: (s.seconds ?? 0) + (e.unit === 'minutes' ? 60 : 5) })) },
      { id: 't10', by: 10, sets: ps.map((s) => ({ seconds: (s.seconds ?? 0) + (e.unit === 'minutes' ? 120 : 10) })) }
    ];
  const top = Math.max(...ps.map((s) => s.kg ?? 0));
  const out: QuickOption[] = [{ id: 'same', sets: ps.map((s) => ({ kg: s.kg, reps: s.reps })) }];
  if (top > 0) {
    const inc = stepFor(e.ref, top);
    out.push({ id: 'kg', by: inc, sets: ps.map((s) => ({ kg: s.kg ? r2(s.kg + inc) : undefined, reps: s.reps })) });
  }
  out.push({ id: 'reps', sets: ps.map((s) => ({ kg: s.kg, reps: (s.reps ?? 0) + 1 })) });
  return out;
}

/** Plates on each side for a total weight on a bar; rest = what is left over on each side. */
export function plateMath(total: number, bar: number): { out: number[]; rest: number } {
  let side = (total - bar) / 2;
  const out: number[] = [];
  if (side < 0) return { out, rest: side };
  for (const [p] of PLATES)
    while (side >= p - 1e-9) {
      out.push(p);
      side = Math.round((side - p) * 100) / 100;
    }
  return { out, rest: side };
}

/** Numbers as the page shows them: 60, 62,5 (locale decimal). */
export const fmtN = (n: number, locale = 'en') => (Math.round(n * 10) / 10).toLocaleString(locale);
/** 45 s, 1:30 min. */
export const fmtSec = (v: number) => {
  v = Math.round(v);
  return v >= 60 ? `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')} min` : `${v} s`;
};
/** Sets in a line: "60 kg × 8, 60 kg × 8" or "45 s, 50 s". */
export const setsText = (ss: SetSpec[], unit: Unit, locale = 'en') =>
  ss.map((s) => (unit === 'reps' ? (s.kg ? `${fmtN(s.kg, locale)} kg × ` : '') + (s.reps ?? 0) : fmtSec(s.seconds ?? 0))).join(', ');
export const fmtShort = (day: string, locale = 'en') => new Date(`${day}T12:00:00Z`).toLocaleDateString(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' });
export const clock = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return (h ? `${h}:${String(m).padStart(2, '0')}` : String(m)) + ':' + String(s % 60).padStart(2, '0');
};

/** What a volume weighs about as much as, for the summary ("about as much as a cow"). */
export const FACTS: [number, string][] = [
  [180, 'a piano'], [300, 'a motorbike'], [600, 'a cow'], [1200, 'a car'], [3000, 'a hippo'], [6000, 'an African elephant'], [12000, 'a city bus']
];
export function factFor(vol: number): { times: number; what: string } | null {
  if (vol < 150) return null;
  let best = FACTS[0];
  for (const f of FACTS) if (vol / f[0] >= 1) best = f;
  return { times: Math.round((vol / best[0]) * 10) / 10, what: best[1] };
}

/** Confetti for a record, on a canvas over the page. */
export function confetti(c: HTMLCanvasElement) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const ctx = c.getContext('2d');
  if (!ctx) return;
  const W = (c.width = innerWidth);
  const H = (c.height = innerHeight);
  const cols = ['#D23A2E', '#1F5FC4', '#E9B713', '#2F9A57', '#1B2130'];
  const P = Array.from({ length: 90 }, () => ({
    x: W / 2 + (Math.random() - 0.5) * 60, y: H * 0.32, vx: (Math.random() - 0.5) * 11, vy: -Math.random() * 11 - 4,
    r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.3, w: 6 + Math.random() * 6, h: 3 + Math.random() * 4, c: cols[Math.floor(Math.random() * cols.length)]
  }));
  const t0 = performance.now();
  const step = (t: number) => {
    ctx.clearRect(0, 0, W, H);
    for (const p of P) {
      p.vy += 0.32;
      p.vx *= 0.99;
      p.x += p.vx;
      p.y += p.vy;
      p.r += p.vr;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.r);
      ctx.fillStyle = p.c;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
    if (t - t0 < 2200) requestAnimationFrame(step);
    else ctx.clearRect(0, 0, W, H);
  };
  requestAnimationFrame(step);
  try {
    navigator.vibrate?.([30, 40, 30]);
  } catch {
    /* none */
  }
}
