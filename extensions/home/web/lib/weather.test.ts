import { describe, expect, it } from 'vitest';
import { condition, forecastWarnings, normalize, parseCoords, periods, summary } from './weather';

function raw(overrides: { precip?: number[]; gusts?: number[]; codes?: number[]; temps?: number[] } = {}) {
  const time: string[] = [];
  for (let i = 0; i < 48; i++) {
    const d = new Date(Date.UTC(2026, 10, 11, 0) + i * 3600_000);
    time.push(d.toISOString().slice(0, 16));
  }
  const fill = (v: number[] | undefined, def: number) => time.map((_, i) => v?.[i - 17] ?? def);
  return {
    timezone: 'Europe/Warsaw',
    current: { time: '2026-11-11T17:45', temperature_2m: 6.2, apparent_temperature: 3.1, weather_code: 63, wind_speed_10m: 10, wind_gusts_10m: 22, precipitation: 1.3, is_day: 0 },
    hourly: {
      time,
      temperature_2m: fill(overrides.temps, 5),
      precipitation: fill(overrides.precip, 0),
      precipitation_probability: fill(undefined, 10),
      weather_code: fill(overrides.codes, 3),
      wind_speed_10m: fill(undefined, 8),
      wind_gusts_10m: fill(overrides.gusts, 20),
      is_day: time.map((t) => (Number(t.slice(11, 13)) >= 7 && Number(t.slice(11, 13)) < 16 ? 1 : 0))
    },
    daily: { time: ['2026-11-11', '2026-11-12'], sunrise: ['2026-11-11T06:58', '2026-11-12T07:00'], sunset: ['2026-11-11T15:59', '2026-11-12T15:57'] }
  };
}

describe('normalize', () => {
  const w = normalize(raw({ precip: [0, 0.3, 0, 0, 0, 0, 0, 2.5] }), 'Warszawa', new Date('2026-11-11T16:45:00Z'));
  it('starts at the current hour and keeps 24 hours', () => {
    expect(w.hours).toHaveLength(24);
    expect(w.hours[0].time).toBe('2026-11-11T17:00');
    expect(w.current.temp).toBe(6.2);
    expect(w.current.isDay).toBe(false);
    expect(w.sunrise).toBe('2026-11-11T06:58');
  });
  it('summarizes rain, wind and the night', () => {
    const s = summary(w);
    expect(s.heaviest).toEqual({ mm: 2.5, time: '2026-11-12T00:00' });
    expect(s.rainTotal).toBe(2.8);
    expect(s.wind).toEqual({ min: 8, max: 8, gusts: 20 });
    expect(s.night).toBe(5);
  });
  it('gives four 6-hour periods after the current one', () => {
    const p = periods(w.hours);
    expect(p.map((x) => x.time.slice(11))).toEqual(['20:00', '02:00', '08:00', '14:00']);
    expect(p[0].precip).toBe(2.5);
  });
});

describe('forecastWarnings', () => {
  it('stays quiet on an ordinary day', () => {
    expect(forecastWarnings(normalize(raw(), 'x'))).toEqual([]);
  });
  it('warns of storms, strong gusts and heavy rain', () => {
    const w = normalize(raw({ codes: [3, 3, 95], gusts: [20, 75], precip: [0, 8] }), 'x');
    expect(forecastWarnings(w).map((x) => x.title)).toEqual(['Thunderstorms', 'Strong wind', 'Heavy rain']);
  });
});

describe('condition and coordinates', () => {
  it('maps WMO codes', () => {
    expect(condition(63)).toEqual({ label: 'Rain', sky: 'rain' });
    expect(condition(2).sky).toBe('partly');
    expect(condition(null).label).toBe('—');
  });
  it('reads coordinates or leaves a name for geocoding', () => {
    expect(parseCoords('52.23, 21.01')).toEqual({ lat: 52.23, lon: 21.01 });
    expect(parseCoords('Warszawa')).toBeNull();
    expect(parseCoords('95, 10')).toBeNull();
  });
});
