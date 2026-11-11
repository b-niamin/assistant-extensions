/**
 * Tools for the AI (spec 005 of the core): the gym log through the assistant's MCP server, as
 * `gym__<tool>`. The app keeps everything in one localStorage key, `gym-notebook.v1`:
 * `{app, version: 1, docs: {<id>: workout | plan | settings}}` (see app.html, sanitize()), which the shell
 * stores per profile; ctx.kv is that storage. Writes add documents in the same shape and never change or
 * remove existing ones; the app shows them the next time it opens.
 */
import type { ExtTool } from '$shell';

const KEY = 'gym-notebook.v1';
const DAY = /^\d{4}-\d{2}-\d{2}$/;

interface SetDoc {
  kg: string;
  reps: string;
  done: boolean;
}
interface ExerciseDoc {
  name: string;
  lib?: string;
  type?: 't' | 'w';
  note?: string;
  sets?: SetDoc[];
  n?: number;
}
interface Doc {
  kind?: 'plan' | 'settings';
  name?: string;
  date?: string;
  createdAt?: number;
  startedAt?: number | null;
  finishedAt?: number | null;
  usedAt?: number | null;
  done?: boolean;
  planName?: string;
  sample?: boolean;
  goal?: number;
  unit?: 'kg' | 'lb';
  exercises?: ExerciseDoc[];
}
interface Store {
  app: string;
  version: number;
  docs: Record<string, Doc>;
}

async function read(kv: { get(k: string): Promise<string | null> }): Promise<Store> {
  try {
    const v = JSON.parse((await kv.get(KEY)) ?? 'null');
    if (v && typeof v === 'object' && v.docs && typeof v.docs === 'object') return { app: 'gym-notebook', version: 1, docs: v.docs };
  } catch {
    /* empty or broken: start fresh, the app does the same */
  }
  return { app: 'gym-notebook', version: 1, docs: {} };
}

const newId = () => `ai${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
const num = (v: unknown) => {
  const n = parseFloat(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) && n >= 0 && n < 100000 ? String(Math.round(n * 1000) / 1000) : '';
};
const text = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);
const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/** One exercise of a workout in plain fields: sets with reps (or seconds for timed ones) and kg. */
const plainExercise = (e: ExerciseDoc) => ({
  name: e.name,
  ...(e.note ? { note: e.note } : {}),
  sets: (e.sets ?? []).filter((s) => Number(s.reps) > 0).map((s) => ({ kg: Number(s.kg) || 0, reps: Number(s.reps) }))
});

export const tools: ExtTool[] = [
  {
    name: 'overview',
    title: 'Gym log',
    readOnly: true,
    description:
      'The gym log of a profile: the weekly goal and unit, every saved plan (exercises and planned sets), how ' +
      'many workouts were finished this week and in the last 30 days, and the last `limit` workouts (default 10, ' +
      'max 100) with each exercise and its sets (kg and reps; reps are seconds for timed exercises). Dates are YYYY-MM-DD.',
    input: { type: 'object', properties: { limit: { type: 'integer', minimum: 1, maximum: 100 } } },
    run: async (args, ctx) => {
      const { docs } = await read(ctx.kv);
      const limit = Math.min(100, Math.max(1, Number(args.limit) || 10));
      const settings = docs.settings ?? {};
      const workouts = Object.entries(docs)
        .filter(([, d]) => !d.kind && d.date)
        .map(([id, d]) => ({ id, ...d }))
        .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '') || (b.createdAt ?? 0) - (a.createdAt ?? 0));
      const today = new Date();
      const monday = new Date(today);
      monday.setUTCDate(today.getUTCDate() - ((today.getUTCDay() + 6) % 7));
      const since30 = new Date(today.getTime() - 30 * 86400_000);
      const finished = workouts.filter((w) => w.done);
      return {
        unit: settings.unit === 'lb' ? 'lb' : 'kg',
        weeklyGoal: settings.goal ?? 3,
        finishedThisWeek: finished.filter((w) => (w.date ?? '') >= isoDay(monday)).length,
        finishedLast30Days: finished.filter((w) => (w.date ?? '') >= isoDay(since30)).length,
        inProgress: workouts.find((w) => !w.done)?.date ?? null,
        plans: Object.entries(docs)
          .filter(([, d]) => d.kind === 'plan')
          .map(([id, p]) => ({ id, name: p.name, exercises: (p.exercises ?? []).map((e) => ({ name: e.name, sets: e.n ?? 3 })) })),
        workouts: workouts.slice(0, limit).map((w) => ({
          id: w.id,
          date: w.date,
          done: !!w.done,
          plan: w.planName ?? null,
          sample: !!w.sample,
          minutes: w.startedAt && w.finishedAt ? Math.round((w.finishedAt - w.startedAt) / 60000) : null,
          exercises: (w.exercises ?? []).map(plainExercise)
        }))
      };
    }
  },
  {
    name: 'log_workout',
    title: 'Log a workout',
    readOnly: false,
    description:
      'Add a finished workout to the gym log: a date and its exercises with the sets done (kg and reps). It ' +
      'is added next to the existing ones, nothing is changed or removed. Use the exercise names the log ' +
      'already uses (see overview) so progress charts line up. The app shows it the next time it opens.',
    input: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'YYYY-MM-DD' },
        plan_name: { type: 'string', description: 'Optional: the plan it followed' },
        exercises: {
          type: 'array',
          maxItems: 60,
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              note: { type: 'string' },
              sets: {
                type: 'array',
                maxItems: 40,
                items: { type: 'object', properties: { kg: { type: 'number' }, reps: { type: 'number' } }, required: ['reps'] }
              }
            },
            required: ['name', 'sets']
          }
        }
      },
      required: ['date', 'exercises']
    },
    run: async (args, ctx) => {
      const date = String(args.date ?? '');
      if (!DAY.test(date) || Number.isNaN(Date.parse(date))) throw new Error('date must be YYYY-MM-DD');
      const raw = Array.isArray(args.exercises) ? args.exercises.slice(0, 60) : [];
      const exercises: ExerciseDoc[] = raw
        .map((e: Record<string, unknown>) => ({
          name: text(e?.name, 80),
          ...(e?.note ? { note: text(e.note, 500) } : {}),
          sets: (Array.isArray(e?.sets) ? e.sets.slice(0, 40) : []).map((s: Record<string, unknown>) => ({ kg: num(s?.kg), reps: num(s?.reps), done: true }))
        }))
        .filter((e) => e.name && e.sets.some((s) => Number(s.reps) > 0));
      if (!exercises.length) throw new Error('exercises: at least one with a name and a set with reps');
      const store = await read(ctx.kv);
      const id = newId();
      const now = Date.now();
      store.docs[id] = {
        date,
        createdAt: now,
        startedAt: null,
        finishedAt: null,
        done: true,
        ...(args.plan_name ? { planName: text(args.plan_name, 40) } : {}),
        exercises
      };
      await ctx.kv.set(KEY, JSON.stringify(store));
      return { saved: { id, date, exercises: exercises.map(plainExercise) } };
    }
  },
  {
    name: 'save_plan',
    title: 'Save a workout plan',
    readOnly: false,
    description:
      'Add a workout plan to the gym log: a name and its exercises with the number of sets each. The owner ' +
      'starts a workout from it in the app. Existing plans are kept, even one with the same name.',
    input: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Up to 40 characters' },
        exercises: {
          type: 'array',
          maxItems: 60,
          items: { type: 'object', properties: { name: { type: 'string' }, sets: { type: 'integer', minimum: 1, maximum: 20 } }, required: ['name'] }
        }
      },
      required: ['name', 'exercises']
    },
    run: async (args, ctx) => {
      const name = text(args.name, 40);
      if (!name) throw new Error('name is required');
      const raw = Array.isArray(args.exercises) ? args.exercises.slice(0, 60) : [];
      const exercises = raw
        .map((e: Record<string, unknown>) => ({ name: text(e?.name, 80), n: Math.min(20, Math.max(1, Math.round(Number(e?.sets) || 3))) }))
        .filter((e) => e.name);
      if (!exercises.length) throw new Error('exercises: at least one with a name');
      const store = await read(ctx.kv);
      const id = newId();
      store.docs[id] = { kind: 'plan', name, createdAt: Date.now(), usedAt: null, exercises };
      await ctx.kv.set(KEY, JSON.stringify(store));
      return { saved: { id, name, exercises: exercises.map((e) => ({ name: e.name, sets: e.n })) } };
    }
  }
];
