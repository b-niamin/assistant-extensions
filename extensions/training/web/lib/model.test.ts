import { describe, expect, it } from 'vitest';
import { addDays, bests, cleanExercises, exerciseLine, garminWorkout, mondayOf, sessionColumns, sessionProblems, stepsLine } from './model';
import { weekOf, weekTile } from './view';

const base = { id: 's1', sport: 'running' as const, title: '5x100 m strides', day: '2026-11-20', description: null, steps: null, exercises: null, duration_min: null, distance_m: null };

describe('training model', () => {
  it('checks sessions for the tools and the page alike', () => {
    expect(sessionProblems({ day: '2026-11-20', sport: 'running', title: 'Easy run' }, true)).toEqual([]);
    expect(sessionProblems({}, true)).toHaveLength(3);
    expect(sessionProblems({ day: '2026-02-30x' }, false)).toEqual(['day: YYYY-MM-DD']);
    expect(sessionProblems({ time_local: '25:00', duration_min: 0 }, false)).toEqual(['time_local: HH:MM', 'duration_min: 1-1440']);
    expect(sessionColumns({ title: '  Long run ', time_local: '', duration_min: 90 })).toEqual({ title: 'Long run', time_local: null, duration_min: 90 });
  });
  it('cleans exercises and bounds the numbers', () => {
    expect(cleanExercises([{ name: 'Squat', sets: [{ reps: '8', kg: '60,5' }, { reps: -1 }] }, { sets: [] }, 'x'])).toEqual([{ name: 'Squat', sets: [{ reps: 8, kg: 60.5 }, {}] }]);
    expect(exerciseLine({ name: 'Squat', sets: [{ reps: 8, kg: 60 }, { reps: 8, kg: 60 }, { reps: 8, kg: 60 }] })).toBe('Squat 3x8 @ 60 kg');
    expect(exerciseLine({ name: 'Plank', sets: [{ seconds: 45 }, { seconds: 45 }] })).toBe('Plank 2x45 s');
  });
  it('turns a session into the watch workout health__send_workout takes', () => {
    const steps = [{ kind: 'warmup', durationType: 'time', durationValue: 600 }, { kind: 'repeat', repeats: 5, steps: [{ kind: 'work', durationType: 'distance', durationValue: 100 }, { kind: 'recovery', durationType: 'time', durationValue: 60 }] }];
    expect(garminWorkout({ ...base, steps })).toEqual({ ref: 'training:s1', sport: 'running', title: '5x100 m strides', day: '2026-11-20', steps });
    const gym = garminWorkout({ ...base, sport: 'strength', title: 'Full body', exercises: [{ name: 'Squat', sets: [{ reps: 5, kg: 80 }] }] });
    expect(gym?.sport).toBe('strength_training');
    expect(gym?.steps).toEqual([{ kind: 'work', durationType: 'lap', note: 'Squat 1x5 @ 80 kg' }]);
    expect(garminWorkout({ ...base, duration_min: 45 })?.steps).toEqual([{ kind: 'work', durationType: 'time', durationValue: 2700 }]);
    expect(stepsLine(steps)).toBe('10 min warm-up · 5 x (100 m work, 1 min recovery)');
  });
  it('finds the best set of each exercise', () => {
    expect(bests([{ day: '2026-11-01', exercises: [{ name: 'Squat', sets: [{ kg: 60, reps: 8 }, { kg: 70, reps: 3 }] }] }, { day: '2026-11-08', exercises: [{ name: 'squat', sets: [{ kg: 70, reps: 5 }] }] }])).toEqual([{ name: 'squat', kg: 70, reps: 5, day: '2026-11-08' }]);
  });
  it('lays out the week from Monday and builds the tile', () => {
    expect(mondayOf('2026-11-15')).toBe('2026-11-09');
    expect(addDays('2026-10-25', 1)).toBe('2026-10-26');
    const s = { ...base, plan_id: null, time_local: null, status: 'planned' as const, result: null, done_at: null, activity_ref: null, sent_at: null, source: null };
    const week = weekOf('2026-11-18', [s]);
    expect(week[0].day).toBe('2026-11-16');
    expect(week[4].sessions).toHaveLength(1);
    expect(weekTile([s], '2026-11-18').kpis?.map((k) => k.value)).toEqual([0, 1]);
    expect(weekTile([], '2026-11-18').empty).toBeTruthy();
  });
});
