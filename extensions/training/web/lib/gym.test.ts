import { describe, expect, it } from 'vitest';
import { bestBefore, historyOf, imageOf, isRecord, keyOf, lastPerf, muscleLoad, plateMath, quickOptions, recovery, setsText, usedOn, type Logged } from './gym';
import { LIBRARY } from './library';
import type { ExerciseItem } from './model';

const squat = (sets: ExerciseItem['sets']): ExerciseItem => ({ kind: 'exercise', ref: 'squat', name: 'Barbell back squat', unit: 'reps', sets });
const history: Logged[] = [
  { id: 'b', day: '2026-11-12', items: [squat([{ kg: 70, reps: 5, done: true }, { kg: 90, reps: 5 }])] },
  { id: 'a', day: '2026-11-05', items: [squat([{ kg: 60, reps: 8 }, { kg: 60, reps: 8 }])] }
];

describe('the gym side', () => {
  it('has a photo of every exercise with muscles', () => {
    for (const e of LIBRARY) if (e.kind === 'exercise' && e.muscles?.length) expect([e.id, imageOf(e.id, 0), imageOf(e.id, 1)].every(Boolean)).toBe(true);
  });
  it('knows last time, the best and the history, ticked sets only once any is ticked', () => {
    expect(keyOf({ name: ' My Row ' })).toBe('c:my row');
    expect(lastPerf(history, 'squat')).toEqual({ day: '2026-11-12', unit: 'reps', sets: [{ kg: 70, reps: 5, done: true }], note: undefined });
    expect(lastPerf(history, 'squat', 'b')?.day).toBe('2026-11-05');
    const best = bestBefore(history, 'squat');
    expect(Math.round(best.e1rm)).toBe(82);
    expect(isRecord(squat([{ kg: 80, reps: 5, done: true }]), 0, best)).toBe(true);
    expect(isRecord(squat([{ kg: 80, reps: 5 }]), 0, best)).toBe(false);
    expect(historyOf(history, 'squat').map((h) => [h.day, h.maxKg, h.vol])).toEqual([['2026-11-05', 60, 960], ['2026-11-12', 70, 350]]);
    expect(usedOn(history).get('squat')).toBe('2026-11-12');
    expect(setsText([{ kg: 62.5, reps: 8 }], 'reps')).toBe('62.5 kg × 8');
  });
  it('fills the sets from last time', () => {
    const prev = lastPerf(history, 'squat', 'b')!;
    expect(quickOptions(squat([]), prev).map((o) => [o.id, o.sets[0]])).toEqual([['same', { kg: 60, reps: 8 }], ['kg', { kg: 62.5, reps: 8 }], ['reps', { kg: 60, reps: 9 }]]);
  });
  it('counts muscles and recovery, and the plates', () => {
    expect(muscleLoad([squat([{ reps: 5, done: true }, { reps: 5 }])], 'done')).toEqual({ quads: 1, glutes: 1, lower: 0.5, hams: 0.5 });
    expect(recovery(history, '2026-11-13').quads).toBe(1);
    expect(plateMath(100, 20)).toEqual({ out: [25, 15], rest: 0 });
    expect(plateMath(61.5, 20).rest).toBe(0.25);
  });
});
