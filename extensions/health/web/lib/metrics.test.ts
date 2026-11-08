import { expect, it } from 'vitest';
import { extractValue, formatValue, specOf } from './metrics';

it('extracts nested and array-shaped Garmin values', () => {
  expect(extractValue(specOf('hrv')!, { hrvSummary: { lastNightAvg: 52 } })).toBe(52);
  expect(extractValue(specOf('sleep')!, { dailySleepDTO: { sleepTimeSeconds: 27000 } })).toBe(27000);
  expect(extractValue(specOf('body_battery')!, { bodyBatteryValuesArray: [[1, 'x', 40], [2, 'x', 87]] })).toBe(87);
  expect(extractValue(specOf('steps')!, { totalSteps: null })).toBeNull();
});

it('formats durations and units', () => {
  expect(formatValue(specOf('sleep')!, 27000)).toBe('7h 30m');
  expect(formatValue(specOf('hrv')!, 52.4)).toBe('52 ms');
  expect(formatValue(specOf('hrv')!, null)).toBe('–');
});
