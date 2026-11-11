/**
 * Daily metric table + value extraction from the raw Garmin payloads stored in
 * health.synced_metric_days.data. Ported from open-vitals apps/web/src/lib/server/garmin/metric-specs.ts.
 * Candidate keys are tried in order; a missing field yields null, never a throw.
 */
export type MetricKey =
  | 'sleep'
  | 'hrv'
  | 'body_battery'
  | 'training_readiness'
  | 'resting_heart_rate'
  | 'stress'
  | 'steps'
  | 'spo2'
  | 'respiration'
  | 'calories';

export type MetricFormat = 'int' | 'duration';

export interface MetricSpec {
  key: MetricKey;
  label: string;
  unit: string;
  format: MetricFormat;
  goodWhen: 'up' | 'down';
  keys: string[];
  extract?: (data: Record<string, unknown>) => number | null;
}

export const METRICS: MetricSpec[] = [
  { key: 'training_readiness', label: 'Training readiness', unit: '', format: 'int', goodWhen: 'up', keys: ['score'] },
  { key: 'sleep', label: 'Sleep', unit: '', format: 'duration', goodWhen: 'up', keys: ['dailySleepDTO.sleepTimeSeconds'] },
  { key: 'hrv', label: 'HRV', unit: 'ms', format: 'int', goodWhen: 'up', keys: ['hrvSummary.lastNightAvg', 'hrvSummary.weeklyAvg'] },
  {
    key: 'body_battery',
    label: 'Body Battery (peak)',
    unit: '',
    format: 'int',
    goodWhen: 'up',
    keys: [],
    // Per-reading array over the day; rows are [epochMs, status, level, ...]. Daily value = peak.
    extract: (data) => maxOfArray(data['bodyBatteryValuesArray'], 2)
  },
  { key: 'resting_heart_rate', label: 'Resting HR', unit: 'bpm', format: 'int', goodWhen: 'down', keys: ['restingHeartRate'] },
  { key: 'stress', label: 'Stress', unit: '', format: 'int', goodWhen: 'down', keys: ['avgStressLevel'] },
  { key: 'steps', label: 'Steps', unit: '', format: 'int', goodWhen: 'up', keys: ['totalSteps'] },
  { key: 'spo2', label: 'SpO2', unit: '%', format: 'int', goodWhen: 'up', keys: ['averageSpo2'] },
  {
    key: 'respiration',
    label: 'Respiration',
    unit: 'brpm',
    format: 'int',
    goodWhen: 'down',
    keys: ['avgWakingRespirationValue', 'avgSleepRespirationValue']
  },
  { key: 'calories', label: 'Calories', unit: 'kcal', format: 'int', goodWhen: 'up', keys: ['totalKilocalories'] }
];

export const METRIC_KEYS = METRICS.map((m) => m.key);

export function specOf(key: string): MetricSpec | undefined {
  return METRICS.find((m) => m.key === key);
}

/** Unwrap `{metric, date, data}` if present, else treat the value as the payload itself. */
export function inner(raw: unknown): Record<string, unknown> | null {
  if (raw && typeof raw === 'object') {
    const o = raw as Record<string, unknown>;
    if ('data' in o && o.data && typeof o.data === 'object') return o.data as Record<string, unknown>;
    return o;
  }
  return null;
}

function readPath(data: Record<string, unknown>, path: string): unknown {
  let cur: unknown = data;
  for (const seg of path.split('.')) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}

export function pick(data: Record<string, unknown> | null, keys: string[]): number | null {
  if (!data) return null;
  for (const k of keys) {
    const v = readPath(data, k);
    if (typeof v === 'number' && Number.isFinite(v)) return v;
  }
  return null;
}

export function maxOfArray(arr: unknown, col: number): number | null {
  if (!Array.isArray(arr)) return null;
  let max: number | null = null;
  for (const row of arr) {
    const v = Array.isArray(row) ? row[col] : undefined;
    if (typeof v === 'number' && Number.isFinite(v)) max = max === null ? v : Math.max(max, v);
  }
  return max;
}

export function extractValue(spec: MetricSpec, raw: unknown): number | null {
  const data = inner(raw);
  if (!data) return null;
  return spec.extract ? spec.extract(data) : pick(data, spec.keys);
}

export function formatValue(spec: MetricSpec, v: number | null, locale = 'en-US'): string {
  if (v === null) return '–';
  if (spec.format === 'duration') {
    const h = Math.floor(v / 3600);
    const m = Math.round((v % 3600) / 60);
    return `${h}h ${String(m).padStart(2, '0')}m`;
  }
  return `${Math.round(v).toLocaleString(locale)}${spec.unit ? ' ' + spec.unit : ''}`;
}
