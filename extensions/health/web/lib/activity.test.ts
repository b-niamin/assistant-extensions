import { expect, it } from 'vitest';
import { aiLaps, aiSamples, aiSummary, buckets, hrZones } from './activity';

it('cuts samples into even buckets', () => {
  expect(buckets(10, 3)).toEqual([[0, 3], [3, 6], [6, 10]]);
  expect(buckets(2, 120)).toEqual([[0, 1], [1, 2]]);
});

it('averages streams per bucket and turns speed into pace for runs', () => {
  const raw = {
    time: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    heartRate: [100, 110, 120, 130, 140, 150, 160, 170, null, 180],
    speed: [3, 3, 3, 3, 3, 4, 4, 4, 4, 4],
    cadence: [80, 80, 80, 80, 80, 90, 90, 90, 90, 90],
    grade: [1, 1, 1, 1, 1, -2, -2, -2, -2, -2],
    gps: [[50, 19]],
    stamina: [1, 2, 3]
  };
  const s = aiSamples(raw, 'running', 10);
  expect(s.samples).toBe(10);
  expect(s.series.heartRate?.[8]).toBeNull();
  expect(s.series.pace_s_per_km?.[0]).toBe(333);
  expect(s.series.speed_mps?.[9]).toBe(4);
  expect(s.series.grade?.[9]).toBe(-2);
  expect(s.series).not.toHaveProperty('gps');
  expect(s.series).not.toHaveProperty('stamina'); // wrong length: not aligned with time
  expect(aiSamples(raw, 'cycling', 10, ['heartRate']).series).toEqual({ heartRate: raw.heartRate });
});

it('passes laps through and keeps only workout figures of the summary', () => {
  expect(aiLaps([{ durationS: 300.123, avgHr: 150, intensityType: 'ACTIVE', junk: { a: 1 } }])).toEqual([
    { index: 1, durationS: 300.12, avgHr: 150, intensityType: 'ACTIVE' }
  ]);
  const raw = { activityId: 1, ownerId: 2, startLatitude: 50, maxHR: 171, hrTimeInZone_2: 600.4, hrTimeInZone_1: 30, averageHR: 133, avgVerticalOscillation: 8.6, beginTimestamp: 1, deviceId: 3, userProfileId: 4 };
  expect(aiSummary(raw)).toEqual({ maxHR: 171, hrTimeInZone_2: 600.4, hrTimeInZone_1: 30, averageHR: 133, avgVerticalOscillation: 8.6 });
  expect(hrZones(raw)).toEqual([{ zone: 1, seconds: 30 }, { zone: 2, seconds: 600 }]);
  expect(hrZones({})).toBeNull();
});
