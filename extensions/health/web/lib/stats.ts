/** Pure helpers behind the health dashboard figures and charts (no DB, no DOM). */
import type { Translate } from '$shell';
import { EN } from './i18n';
import type { MetricSpec } from './metrics';

export interface Point {
  day: string;
  value: number | null;
}

export interface Delta {
  /** latest minus the baseline mean */
  diff: number;
  /** mean of the 7 readings before the latest one */
  baseline: number;
  /** 'good' | 'bad' given the metric's goodWhen, 'flat' when within 2 % of the baseline */
  tone: 'good' | 'bad' | 'flat';
}

/** Latest reading against the mean of the previous 7 readings. Needs at least 3 of them. */
export function deltaVsBaseline(spec: Pick<MetricSpec, 'goodWhen'>, points: Point[]): Delta | null {
  const vals = points.map((p) => p.value).filter((v): v is number => v !== null);
  if (vals.length < 4) return null;
  const latest = vals[vals.length - 1];
  const prev = vals.slice(-8, -1);
  const baseline = prev.reduce((a, b) => a + b, 0) / prev.length;
  const diff = latest - baseline;
  const flat = Math.abs(diff) <= Math.abs(baseline) * 0.02;
  const up = diff > 0;
  const tone = flat ? 'flat' : up === (spec.goodWhen === 'up') ? 'good' : 'bad';
  return { diff, baseline, tone };
}

export type Level = { label: string; tone: 'good' | 'warning' | 'serious' | 'critical' };

/** Garmin's own Training Readiness bands. */
export function readinessLevel(score: number | null): Level | null {
  if (score === null) return null;
  if (score >= 95) return { label: 'Prime', tone: 'good' };
  if (score >= 75) return { label: 'High', tone: 'good' };
  if (score >= 50) return { label: 'Moderate', tone: 'warning' };
  if (score >= 25) return { label: 'Low', tone: 'serious' };
  return { label: 'Poor', tone: 'critical' };
}

/** Round axis ticks (1, 2, 2.5, 5 × 10^n) covering [min, max]. */
export function niceTicks(min: number, max: number, count = 4): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const raw = (max - min) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const out: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) out.push(Number(v.toFixed(10)));
  return out;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** '2026-11-03' -> '3 Nov' (or '3 Nov 2025' when withYear); in the page's language when a locale is given. */
export function shortDay(iso: string, withYear = false, locale?: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  if (locale && !locale.startsWith('en')) {
    return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: withYear ? 'numeric' : undefined, timeZone: 'UTC' });
  }
  return `${d} ${MONTHS[m - 1]}${withYear ? ' ' + y : ''}`;
}

/** Whole days between two ISO days (b - a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b.slice(0, 10)) - Date.parse(a.slice(0, 10))) / 86_400_000);
}

/** '12 min ago', '3 h ago', '2 d ago'. */
export function ago(from: Date | string, now = new Date(), t: Translate = EN): string {
  const s = Math.max(0, (now.getTime() - new Date(from).getTime()) / 1000);
  if (s < 90) return t('just now');
  if (s < 3600) return t('{n} min ago', { n: Math.round(s / 60) });
  if (s < 86400 * 2) return t('{n} h ago', { n: Math.round(s / 3600) });
  return t('{n} d ago', { n: Math.round(s / 86400) });
}
