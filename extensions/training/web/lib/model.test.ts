import { describe, expect, it } from 'vitest';
import { GROUP_OF, groupFor, itemFrom, LIBRARY, libraryById, MUSCLES, searchLibrary } from './library';
import {
  addDays,
  autoTitle,
  bests,
  cleanItems,
  exerciseLine,
  garminWorkout,
  itemsOf,
  mainSport,
  minutesOf,
  mondayOf,
  parseTarget,
  progressOf,
  sessionColumns,
  sessionProblems,
  stepsLine,
  targetInput,
  type Item,
  type Session
} from './model';
import { weekOf, weekTile } from './view';

const run: Item = { kind: 'cardio', sport: 'running', duration_min: 30 };
const squat: Item = { kind: 'exercise', name: 'Barbell back squat', unit: 'reps', sets: [{ reps: 5, kg: 80 }, { reps: 5, kg: 80 }] };
const sauna: Item = { kind: 'exercise', name: 'Sauna', unit: 'minutes', sets: [{ seconds: 900 }] };
const base: Session = {
  id: 's1',
  plan_id: null,
  day: '2026-11-20',
  time_local: null,
  sport: 'running',
  title: 'Run, gym, sauna',
  description: null,
  duration_min: null,
  items: [run, squat, sauna],
  status: 'planned',
  result: null,
  done_at: null,
  activity_ref: null,
  sent_at: null,
  source: null
};

describe('training model', () => {
  it('checks workouts for the tools and the page alike', () => {
    expect(sessionProblems({ day: '2026-11-20', items: [run] }, true)).toEqual([]);
    expect(sessionProblems({ day: '2026-11-20', title: 'Easy run' }, true)).toEqual([]);
    expect(sessionProblems({}, true)).toEqual(['day: YYYY-MM-DD', 'title or items: give at least one']);
    expect(sessionProblems({ day: '2026-02-30x' }, false)).toEqual(['day: YYYY-MM-DD']);
    expect(sessionProblems({ time_local: '25:00', duration_min: 0 }, false)).toEqual(['time_local: HH:MM', 'duration_min: 1-1440']);
    expect(sessionProblems({ items: [{ kind: 'exercise' } as never] }, false)).toHaveLength(1);
    expect(sessionColumns({ title: '  Long run ', time_local: '', duration_min: 90 })).toEqual({ title: 'Long run', time_local: null, duration_min: 90 });
  });
  it('makes a title and the main sport from the items', () => {
    const c = sessionColumns({ items: [run, squat, sauna] });
    expect(c.title).toBe('Running + Barbell back squat + Sauna');
    expect(c.sport).toBe('running');
    expect(autoTitle([squat, { ...squat, name: 'Plank' }])).toBe('Strength (2)');
    expect(mainSport([squat, sauna])).toBe('strength');
    expect(mainSport([sauna])).toBe('other');
  });
  it('cleans items and bounds the numbers', () => {
    expect(cleanItems([{ kind: 'exercise', name: 'Squat', sets: [{ reps: '8', kg: '60,5' }, { reps: -1 }] }, { kind: 'exercise', sets: [] }, 'x'])).toEqual([
      { kind: 'exercise', name: 'Squat', unit: 'reps', sets: [{ reps: 8, kg: 60.5 }, {}] }
    ]);
    expect(cleanItems([{ kind: 'cardio', sport: 'nope', distance_m: '5000', done: true }])).toEqual([{ kind: 'cardio', sport: 'other', distance_m: 5000, done: true }]);
    expect(exerciseLine({ name: 'Squat', sets: [{ reps: 8, kg: 60 }, { reps: 8, kg: 60 }, { reps: 8, kg: 60 }] })).toBe('Squat 3x8 @ 60 kg');
    expect(exerciseLine({ name: 'Plank', unit: 'seconds', sets: [{ seconds: 45 }, { seconds: 45 }] })).toBe('Plank 2x45 s');
    expect(exerciseLine({ name: 'Sauna', unit: 'minutes', sets: [{ seconds: 720 }, { seconds: 720 }, { seconds: 720 }] })).toBe('Sauna 3x12 min');
  });
  it('reads a session from before 1.1 as items', () => {
    expect(itemsOf({ sport: 'running', steps: [{ kind: 'work' }], duration_min: 40, status: 'done' })).toEqual([{ kind: 'cardio', sport: 'running', duration_min: 40, steps: [{ kind: 'work' }], done: true }]);
    expect(itemsOf({ sport: 'strength', exercises: [{ name: 'Plank', sets: [{ seconds: 30 }] }], result: { exercises: [{ name: 'Plank', sets: [{ seconds: 40, done: true }] }] } })).toEqual([
      { kind: 'exercise', name: 'Plank', unit: 'seconds', sets: [{ seconds: 40, done: true }] }
    ]);
    expect(itemsOf({ items: [run] })).toEqual([run]);
  });
  it('turns a workout into the watch workout health__send_workout takes', () => {
    const steps = [{ kind: 'warmup', durationType: 'time', durationValue: 600 }, { kind: 'repeat', repeats: 5, steps: [{ kind: 'work', durationType: 'distance', durationValue: 100 }, { kind: 'recovery', durationType: 'time', durationValue: 60 }] }];
    expect(garminWorkout({ ...base, items: [{ kind: 'cardio', sport: 'running', steps }] })).toEqual({ ref: 'training:s1', sport: 'running', title: 'Run, gym, sauna', day: '2026-11-20', steps });
    const gym = garminWorkout({ ...base, items: [squat, sauna] });
    expect(gym?.sport).toBe('strength_training');
    expect(gym?.steps).toEqual([{ kind: 'work', durationType: 'lap', note: 'Barbell back squat 2x5 @ 80 kg' }]);
    expect(gym?.note).toBe('+ Sauna 15 min');
    const mixed = garminWorkout(base);
    expect(mixed?.sport).toBe('other');
    expect(mixed?.steps).toHaveLength(2);
    expect(garminWorkout({ ...base, items: [sauna] })).toBeNull();
    expect(stepsLine(steps)).toBe('10 min warm-up · 5 x (100 m work, 1 min recovery)');
  });
  it('reads the targets typed in the blocks', () => {
    expect(parseTarget('5:10-4:50')).toEqual({ type: 'pace', low: 290, high: 310 });
    expect(parseTarget('140-150')).toEqual({ type: 'hr', low: 140, high: 150 });
    expect(parseTarget('fast')).toBeUndefined();
    expect(targetInput({ type: 'pace', low: 290, high: 310 })).toBe('4:50-5:10');
    expect(stepsLine([{ kind: 'work', durationType: 'distance', durationValue: 1000, target: { type: 'pace', low: 290, high: 300 } }])).toBe('1 km work @ 4:50-5:00/km');
  });
  it('counts minutes and progress', () => {
    expect(minutesOf(base)).toBe(45);
    expect(progressOf([{ ...run, done: true }, { ...squat, sets: [{ reps: 5, done: true }, { reps: 5 }] }])).toEqual({ done: 2, all: 3 });
  });
  it('finds the best set of each exercise, only ticked sets once any is ticked', () => {
    expect(
      bests([
        { day: '2026-11-01', items: [{ kind: 'exercise', name: 'Squat', unit: 'reps', sets: [{ kg: 60, reps: 8 }, { kg: 70, reps: 3 }] }] },
        { day: '2026-11-08', items: [{ kind: 'exercise', name: 'squat', unit: 'reps', sets: [{ kg: 70, reps: 5, done: true }, { kg: 90, reps: 5 }] }] }
      ])
    ).toEqual([{ name: 'squat', kg: 70, reps: 5, day: '2026-11-08' }]);
  });
  it('has a library to pick from', () => {
    expect(new Set(LIBRARY.map((e) => e.id)).size).toBe(LIBRARY.length);
    for (const e of LIBRARY) for (const m of [...(e.muscles ?? []), ...(e.also ?? [])]) expect(MUSCLES[m]).toBeTruthy();
    expect(libraryById('plank')?.unit).toBe('seconds');
    expect(searchLibrary(LIBRARY, 'glutes', 'all').length).toBeGreaterThan(3);
    expect(searchLibrary(LIBRARY, '', 'back_friendly').every((e) => e.back_friendly)).toBe(true);
    expect(searchLibrary(LIBRARY, 'przysiad', 'all', (s) => (s === 'Barbell back squat' ? 'Przysiad ze sztangą' : s)).map((e) => e.id)).toEqual(['squat']);
    expect(itemFrom(libraryById('sauna')!)).toEqual({ kind: 'exercise', ref: 'sauna', name: 'Sauna', unit: 'minutes', sets: [{ seconds: 720 }, { seconds: 720 }, { seconds: 720 }] });
    expect(itemFrom(libraryById('run')!)).toEqual({ kind: 'cardio', ref: 'run', sport: 'running', name: 'Run' });
    expect(groupFor({ kind: 'exercise', muscles: ['quads'] })).toBe(GROUP_OF.quads);
    expect(groupFor({ kind: 'exercise', unit: 'minutes' })).toBe('recovery');
  });
  it('lays out the week from Monday and builds the tile', () => {
    expect(mondayOf('2026-11-15')).toBe('2026-11-09');
    expect(addDays('2026-10-25', 1)).toBe('2026-10-26');
    const week = weekOf('2026-11-18', [base]);
    expect(week[0].day).toBe('2026-11-16');
    expect(week[4].sessions).toHaveLength(1);
    expect(weekTile([base], '2026-11-18').kpis?.map((k) => k.value)).toEqual([0, 1]);
    expect(weekTile([], '2026-11-18').empty).toBeTruthy();
  });
});
