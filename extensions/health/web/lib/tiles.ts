/** Pure builders for the dashboard tiles (no DB): turn query rows into $shell TileData. */
import type { TileData, Translate } from '$shell';
import { EN } from './i18n';
import { specOf, type MetricKey } from './metrics';
import { deltaVsBaseline, readinessLevel, shortDay, type Point } from './stats';

export const RUN_SPORTS = ['running', 'trail_running', 'treadmill_running', 'track_running', 'indoor_running', 'virtual_run'];

export interface WeekRow {
  /** Monday of the week, ISO day. */
  week: string;
  km: number;
  runs: number;
}

/** ISO week number of a day, for bar labels ("W45"). */
export function isoWeek(iso: string): number {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7) + 3); // the Thursday of that week
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  return Math.ceil(((d.getTime() - yearStart) / 86_400_000 + 1) / 7);
}

/**
 * This week's running km against the average of the previous four weeks, bars for the last 8.
 * The delta stays neutral: a week in progress is always "behind" a full one, so red would lie.
 */
export function runningTile(weeks: WeekRow[], t: Translate = EN): TileData {
  if (!weeks.length || weeks.every((w) => w.runs === 0)) {
    return { empty: { message: t('No runs in the last 8 weeks.') } };
  }
  const current = weeks[weeks.length - 1];
  const prev = weeks.slice(-5, -1);
  const avg = prev.length ? prev.reduce((a, w) => a + w.km, 0) / prev.length : null;
  return {
    kpis: [
      { label: t('This week'), value: round1(current.km), unit: 'km', digits: 1, delta: avg === null ? null : round1(current.km - avg) },
      { label: t('Runs'), value: current.runs }
    ],
    series: {
      kind: 'bars',
      unit: 'km',
      hue: 'blue',
      caption: avg === null ? t('last 8 weeks') : t('last 8 weeks · 4-week avg {km} km', { km: round1(avg) }),
      points: weeks.map((w) => ({ label: t('W{n}', { n: isoWeek(w.week) }), value: round1(w.km) }))
    }
  };
}

const round1 = (v: number) => Math.round(v * 10) / 10;

/** A daily metric as a stat + trend tile: latest reading, delta vs the 7 before it, line of `days`. */
export function metricTile(
  key: MetricKey,
  points: Point[],
  hue: NonNullable<TileData['series']>['hue'],
  today: string,
  t: Translate = EN
): TileData {
  const spec = specOf(key)!;
  const lastIdx = points.findLastIndex((p) => p.value !== null);
  if (lastIdx < 0) return { empty: { message: t('No readings yet.'), action: { label: t('Open Health'), href: '/health' } } };
  const latest = points[lastIdx];
  const delta = deltaVsBaseline(spec, points.slice(0, lastIdx + 1));
  const lag = Math.round((Date.parse(today) - Date.parse(latest.day)) / 86_400_000);
  return {
    kpis: [
      {
        label: lag === 0 ? t('Today') : lag === 1 ? t('Last night') : shortDay(latest.day, false, t.locale),
        value: latest.value,
        unit: spec.unit || undefined,
        format: spec.format === 'duration' ? 'duration' : 'number',
        delta: delta ? Math.round(delta.diff * 10) / 10 : null,
        better: spec.goodWhen
      }
    ],
    series: {
      kind: 'line',
      unit: spec.unit || undefined,
      hue,
      caption: t('last {n} days · vs 7-day avg', { n: points.length }),
      points: points.map((p) => ({ label: shortDay(p.day, false, t.locale), value: p.value }))
    },
    href: `/health?metric=${key}`
  };
}

/** Readiness score with Garmin's band, plus HRV as the second figure and its 14-day trend. */
export function readinessTile(readiness: Point[], hrv: Point[], t: Translate = EN): TileData {
  const r = [...readiness].reverse().find((p) => p.value !== null) ?? null;
  const h = [...hrv].reverse().find((p) => p.value !== null) ?? null;
  if (!r && !h) return { empty: { message: t('Waiting for the first Garmin sync.'), action: { label: t('Open Health'), href: '/health' } } };
  const level = readinessLevel(r?.value ?? null);
  const hrvDelta = deltaVsBaseline(specOf('hrv')!, hrv);
  return {
    kpis: [
      { label: t('Readiness'), value: r?.value ?? null, status: level ? { label: t(level.label), tone: level.tone } : undefined },
      { label: 'HRV', value: h?.value ?? null, unit: 'ms', delta: hrvDelta ? Math.round(hrvDelta.diff) : null, better: 'up' }
    ],
    series: {
      kind: 'line',
      unit: 'ms',
      hue: 'aqua',
      caption: t('HRV, last 14 days'),
      points: hrv.map((p) => ({ label: shortDay(p.day, false, t.locale), value: p.value }))
    },
    href: '/health?metric=hrv'
  };
}
