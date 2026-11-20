/** Pure helpers behind the activity page: thin out the streams, draw the route, read extras from raw. */

export interface Lap {
  index: number;
  durationS?: number;
  distanceM?: number;
  avgSpeedMps?: number;
  avgHr?: number;
  maxHr?: number;
  avgPower?: number;
  elevationGainM?: number;
  avgRunCadenceSpm?: number;
}

export interface Series {
  key: 'heartRate' | 'pace' | 'speed' | 'elevation' | 'power' | 'cadence';
  label: string;
  unit: string;
  /** var(--hue-*) */
  hue: string;
  /** Lower is better on the y axis (pace): drawn upside down. */
  invert?: boolean;
  values: (number | null)[];
}

export interface Streams {
  /** Seconds from start, one per sample (after thinning). */
  time: number[];
  series: Series[];
  /** Route as SVG path data in a 0..1000 box, with start and end points. */
  route: { d: string; start: [number, number]; end: [number, number]; width: number; height: number } | null;
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Indices of at most `max` evenly spread samples, always keeping the first and the last. */
export function thinIndices(n: number, max: number): number[] {
  if (n <= max) return Array.from({ length: n }, (_, i) => i);
  const out: number[] = [];
  for (let k = 0; k < max; k++) out.push(Math.round((k * (n - 1)) / (max - 1)));
  return out;
}

/** Sports whose speed reads as pace (min/km). */
export const PACED = ['running', 'trail_running', 'treadmill_running', 'track_running', 'walking', 'hiking', 'indoor_running'];

/** m/s -> seconds per km; standing still (or GPS noise under 0.5 m/s) is a gap, not a 33-minute pace. */
export const paceOf = (mps: number | null): number | null => (mps != null && mps > 0.5 ? 1000 / mps : null);

export function projectRoute(gps: unknown[], size = 1000): Streams['route'] {
  const pts = gps
    .map((p) => (Array.isArray(p) ? [num(p[0]), num(p[1])] : [null, null]))
    .filter((p): p is [number, number] => p[0] !== null && p[1] !== null && !(p[0] === 0 && p[1] === 0));
  if (pts.length < 2) return null;
  const lats = pts.map((p) => p[0]);
  const lngs = pts.map((p) => p[1]);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  // Equirectangular: a degree of longitude shrinks with cos(latitude). Fine at the scale of one activity.
  const k = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180);
  const w = (maxLng - minLng) * k || 1e-6;
  const h = maxLat - minLat || 1e-6;
  const scale = size / Math.max(w, h);
  const width = Math.max(1, w * scale);
  const height = Math.max(1, h * scale);
  const xy = (p: [number, number]): [number, number] => [(p[1] - minLng) * k * scale, (maxLat - p[0]) * scale];
  const idx = thinIndices(pts.length, 1500);
  const d = idx.map((i, j) => {
    const [x, y] = xy(pts[i]);
    return `${j ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return { d: d.join(''), start: xy(pts[0]), end: xy(pts[pts.length - 1]), width, height };
}

/** Streams as stored by garmin-sync (health.synced_activity_streams.streams), thinned for the page. */
export function buildStreams(raw: Record<string, unknown> | null, sport: string, max = 600): Streams {
  const empty: Streams = { time: [], series: [], route: null };
  if (!raw) return empty;
  const time = Array.isArray(raw.time) ? raw.time.map(num) : [];
  const route = Array.isArray(raw.gps) ? projectRoute(raw.gps) : null;
  if (time.length < 2) return { ...empty, route };
  const idx = thinIndices(time.length, max);
  const pick = (key: string, f: (v: number | null) => number | null = (v) => v) => {
    const arr = raw[key];
    if (!Array.isArray(arr) || !arr.some((v) => num(v) !== null)) return null;
    return idx.map((i) => f(num(arr[i])));
  };
  const series: Series[] = [];
  const add = (s: Omit<Series, 'values'>, values: (number | null)[] | null) => {
    if (values && values.some((v) => v !== null)) series.push({ ...s, values });
  };
  add({ key: 'heartRate', label: 'Heart rate', unit: 'bpm', hue: 'var(--hue-red)' }, pick('heartRate'));
  if (PACED.includes(sport)) add({ key: 'pace', label: 'Pace', unit: '/km', hue: 'var(--hue-blue)', invert: true }, pick('speed', paceOf));
  else add({ key: 'speed', label: 'Speed', unit: 'km/h', hue: 'var(--hue-blue)' }, pick('speed', (v) => (v == null ? null : v * 3.6)));
  add({ key: 'elevation', label: 'Elevation', unit: 'm', hue: 'var(--hue-green)' }, pick('elevation'));
  add({ key: 'power', label: 'Power', unit: 'W', hue: 'var(--hue-yellow)' }, pick('power'));
  const spm = sport.includes('running') || sport === 'walking' || sport === 'hiking';
  add({ key: 'cadence', label: 'Cadence', unit: spm ? 'spm' : 'rpm', hue: 'var(--hue-violet)' }, pick('cadence'));
  return { time: idx.map((i) => time[i] ?? 0), series, route };
}

export function lapsOf(raw: Record<string, unknown> | null): Lap[] {
  const laps = raw && Array.isArray(raw.laps) ? raw.laps : [];
  return laps
    .filter((l): l is Record<string, unknown> => !!l && typeof l === 'object')
    .map((l, i) => {
      const lap: Lap = { index: num(l.index) ?? i + 1 };
      for (const k of ['durationS', 'distanceM', 'avgSpeedMps', 'avgHr', 'maxHr', 'avgPower', 'elevationGainM', 'avgRunCadenceSpm'] as const) {
        const v = num(l[k]);
        if (v !== null) lap[k] = v;
      }
      return lap;
    })
    .slice(0, 200);
}

/** A few figures only the raw Garmin summary has. */
export function extrasOf(raw: Record<string, unknown> | null) {
  const r = raw ?? {};
  const type = r.activityType as { typeKey?: unknown } | undefined;
  return {
    aerobicEffect: num(r.aerobicTrainingEffect),
    anaerobicEffect: num(r.anaerobicTrainingEffect),
    effectLabel: typeof r.trainingEffectLabel === 'string' ? r.trainingEffectLabel : null,
    vo2max: num(r.vO2MaxValue),
    maxSpeedMps: num(r.maxSpeed),
    avgSpeedMps: num(r.averageSpeed),
    elevationLossM: num(r.elevationLoss),
    steps: num(r.steps),
    avgCadence: num(r.averageRunningCadenceInStepsPerMinute) ?? num(r.averageBikingCadenceInRevPerMinute),
    location: typeof r.locationName === 'string' ? r.locationName : null,
    typeKey: typeof type?.typeKey === 'string' ? type.typeKey : null
  };
}

/** "5:12" for seconds per km. */
export function paceText(secPerKm: number | null): string {
  if (secPerKm == null || !Number.isFinite(secPerKm)) return '–';
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return s === 60 ? `${m + 1}:00` : `${m}:${String(s).padStart(2, '0')}`;
}

/** Streams the AI gets, in this order; `speed` also yields `pace_s_per_km` for paced sports. */
export const AI_STREAMS = [
  'heartRate', 'speed', 'cadence', 'grade', 'elevation', 'power', 'temperature', 'respirationRate', 'strideLength',
  'groundContactTime', 'groundContactBalance', 'verticalOscillation', 'verticalRatio', 'stamina', 'staminaPotential',
  'performanceCondition'
] as const;

const round = (v: number, d = 2) => Math.round(v * 10 ** d) / 10 ** d;

/** `n` samples cut into at most `max` buckets: [start, end) index pairs, evenly sized. */
export function buckets(n: number, max: number): [number, number][] {
  const k = Math.max(1, Math.min(n, max));
  return Array.from({ length: k }, (_, b) => [Math.floor((b * n) / k), Math.floor(((b + 1) * n) / k)] as [number, number]);
}

/** Mean of the numbers in arr[from..to), null when there are none. */
function meanOf(arr: unknown[], from: number, to: number): number | null {
  let s = 0;
  let c = 0;
  for (let i = from; i < to; i++) {
    const v = num(arr[i]);
    if (v !== null) {
      s += v;
      c++;
    }
  }
  return c ? s / c : null;
}

/**
 * Stored streams averaged over at most `points` equal stretches (a peak inside one stretch is smoothed: the
 * laps and the summary keep max values). Every stream holds one value per entry of `time_s` (seconds from
 * start of each stretch). No GPS: the route is not the AI's business.
 */
export function aiSamples(raw: Record<string, unknown> | null, sport: string, points = 120, only?: string[]) {
  const time = raw && Array.isArray(raw.time) ? raw.time : [];
  const n = time.length;
  if (n < 2) return { samples: 0, time_s: [] as number[], series: {} as Record<string, (number | null)[]> };
  const parts = buckets(n, Math.min(1000, Math.max(10, points)));
  const series: Record<string, (number | null)[]> = {};
  for (const key of AI_STREAMS) {
    const arr = raw![key];
    if (!Array.isArray(arr) || arr.length !== n || (only && !only.includes(key))) continue;
    const values = parts.map(([a, b]) => meanOf(arr, a, b));
    if (!values.some((v) => v !== null)) continue;
    if (key === 'speed' && PACED.includes(sport)) {
      series.pace_s_per_km = values.map((v) => {
        const p = paceOf(v);
        return p === null ? null : Math.round(p);
      });
    }
    series[key === 'speed' ? 'speed_mps' : key] = values.map((v) => (v === null ? null : round(v)));
  }
  return { samples: n, time_s: parts.map(([a]) => Math.round(num(time[a]) ?? 0)), series };
}

/** Laps (or Garmin's typed splits) as stored, numbers rounded; at most 200. */
export function aiLaps(list: unknown): Record<string, number | string>[] {
  if (!Array.isArray(list)) return [];
  return list
    .filter((l): l is Record<string, unknown> => !!l && typeof l === 'object')
    .slice(0, 200)
    .map((l, i) => {
      const out: Record<string, number | string> = { index: num(l.index) ?? i + 1 };
      for (const [k, v] of Object.entries(l)) {
        if (k === 'index') continue;
        if (typeof v === 'number' && Number.isFinite(v)) out[k] = round(v);
        else if (typeof v === 'string' && v.length <= 60) out[k] = v;
      }
      return out;
    });
}

/** Garmin summary keys that identify people, devices or places rather than describe the workout. */
const SKIP_SUMMARY = /id$|uuid|owner|user|device|latitude|longitude|timestamp|gmt|offset|sequence|manufacturer|privacy|parent|favorite/i;

/**
 * Every top-level number (and true flag) of Garmin's activity summary, e.g. maxHR, hrTimeInZone_1..5,
 * averageRunningCadenceInStepsPerMinute, avgStrideLength, avgVerticalOscillation, avgGroundContactTime,
 * aerobicTrainingEffect, vO2MaxValue, minElevation: field names as Garmin sends them.
 */
export function aiSummary(raw: Record<string, unknown> | null): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw ?? {})) {
    if (typeof v === 'number' && Number.isFinite(v) && !SKIP_SUMMARY.test(k)) out[k] = round(v);
  }
  return out;
}

/** Seconds in each heart-rate zone, from the summary's hrTimeInZone_<n>; null when Garmin sent none. */
export function hrZones(raw: Record<string, unknown> | null): { zone: number; seconds: number }[] | null {
  const zones: { zone: number; seconds: number }[] = [];
  for (const [k, v] of Object.entries(raw ?? {})) {
    const m = /^hrTimeInZone_(\d)$/.exec(k);
    const s = num(v);
    if (m && s !== null) zones.push({ zone: Number(m[1]), seconds: Math.round(s) });
  }
  return zones.length ? zones.sort((a, b) => a.zone - b.zone) : null;
}
