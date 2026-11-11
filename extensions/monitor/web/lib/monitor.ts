/** Pure helpers of the monitor page, tile and tools: units, thresholds, Beni, ranges. */
import type { TileTone, Translate } from '$shell';
import type { Mood } from '$shell/ui';
import { EN } from './i18n';
import type { Bucket, Disk, Latest, Metric, Range, Reading } from './types';

export const RANGES: Range[] = ['1h', '24h', '7d', '30d'];
export const METRICS: Metric[] = ['cpu', 'memory', 'temp', 'net', 'disk'];

/** Bucket size per range: 60 to 96 points on the chart. */
export const BUCKET: Record<Range, { hours: number; minutes: number }> = {
  '1h': { hours: 1, minutes: 1 },
  '24h': { hours: 24, minutes: 15 },
  '7d': { hours: 24 * 7, minutes: 120 },
  '30d': { hours: 24 * 30, minutes: 480 }
};

export const rangeOf = (v: unknown): Range => (RANGES.includes(v as Range) ? (v as Range) : '24h');
export const metricOf = (v: unknown): Metric => (METRICS.includes(v as Metric) ? (v as Metric) : 'cpu');

/** The collector has not written for three passes (at least 90 s). */
export function isStale(latest: Latest | null, now: number): boolean {
  if (!latest) return false;
  const every = Math.max(30, latest.data.interval_s ?? 30);
  return now - Date.parse(latest.at) > Math.max(90_000, every * 3_000);
}

// -- units --------------------------------------------------------------------------------------------

const UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];

/** 1536 -> "1.5 KB", binary steps (what `df -h` and `free -h` show). */
export function bytes(v: number | null | undefined, locale = 'en-GB'): string {
  if (v == null || !Number.isFinite(v)) return '–';
  let i = 0;
  let n = Math.abs(v);
  while (n >= 1024 && i < UNITS.length - 1) {
    n /= 1024;
    i++;
  }
  const digits = i === 0 || n >= 100 ? 0 : n >= 10 ? 1 : 2;
  return `${(Math.sign(v) * n).toLocaleString(locale, { maximumFractionDigits: digits })} ${UNITS[i]}`;
}

export const rate = (v: number | null | undefined, locale = 'en-GB'): string => (v == null ? '–' : `${bytes(v, locale)}/s`);

export function pct(v: number | null | undefined, locale = 'en-GB'): string {
  if (v == null || !Number.isFinite(v)) return '–';
  return `${v.toLocaleString(locale, { maximumFractionDigits: v < 10 ? 1 : 0 })} %`;
}

export const celsius = (v: number | null | undefined): string => (v == null ? '–' : `${Math.round(v)} °C`);

/** 93784 -> "1 d 2 h", 3700 -> "1 h 1 min", 59 -> "1 min". */
export function uptime(s: number | null | undefined, t: Translate = EN): string {
  if (s == null) return '–';
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d) return t('{d} d {h} h', { d, h });
  if (h) return t('{h} h {m} min', { h, m });
  return t('{m} min', { m: Math.max(1, m) });
}

/** "now", "40 s ago", "4 min ago", "2 h ago". */
export function ago(iso: string | undefined, now: number, t: Translate = EN): string {
  const at = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(at)) return '';
  const s = Math.round((now - at) / 1000);
  if (s < 5) return t('now');
  if (s < 60) return t('{n} s ago', { n: s });
  const m = Math.round(s / 60);
  if (m < 60) return t('{n} min ago', { n: m });
  const h = Math.round(m / 60);
  if (h < 48) return t('{n} h ago', { n: h });
  return t('{n} d ago', { n: Math.round(h / 24) });
}

// -- thresholds ---------------------------------------------------------------------------------------

export type Tone = TileTone;
const ORDER: Tone[] = ['good', 'warning', 'serious', 'critical'];
export const worst = (tones: (Tone | null)[]): Tone => tones.reduce<Tone>((a, b) => (b && ORDER.indexOf(b) > ORDER.indexOf(a) ? b : a), 'good');

export const cpuTone = (v: number | null | undefined): Tone | null => (v == null ? null : v >= 90 ? 'serious' : v >= 70 ? 'warning' : 'good');
export const memTone = (v: number | null | undefined): Tone | null => (v == null ? null : v >= 92 ? 'serious' : v >= 80 ? 'warning' : 'good');
/** CPUs throttle around 80-85 °C (a Raspberry Pi at 80, most Intel/AMD near 95-100). */
export const tempTone = (v: number | null | undefined): Tone | null =>
  v == null ? null : v >= 90 ? 'critical' : v >= 80 ? 'serious' : v >= 70 ? 'warning' : 'good';
export const diskTone = (v: number | null | undefined): Tone | null =>
  v == null ? null : v >= 95 ? 'critical' : v >= 90 ? 'serious' : v >= 80 ? 'warning' : 'good';

export const memPct = (r: Reading): number | null => (r.memory?.total ? (100 * r.memory.used) / r.memory.total : null);
/** As `df` counts it: used of what users can have (root's reserved blocks left out). */
export const diskPct = (d: Disk): number | null => (d.used + d.free > 0 ? (100 * d.used) / (d.used + d.free) : null);

export const toneLabel = (tone: Tone, t: Translate = EN): string =>
  ({ good: t('fine'), warning: t('high'), serious: t('very high'), critical: t('critical') })[tone];

/** What deserves a look now, worst first: [tone, sentence]. Empty = all fine. */
export function problems(r: Reading, t: Translate = EN): { tone: Tone; text: string }[] {
  const out: { tone: Tone; text: string }[] = [];
  const th = r.throttling;
  if (th?.under_voltage) out.push({ tone: 'critical', text: t('Under-voltage: the power supply is too weak.') });
  if (th?.throttled) out.push({ tone: 'serious', text: t('The CPU is throttled to keep it cool or powered.') });
  const temp = tempTone(r.temp_c);
  if (temp && temp !== 'good') out.push({ tone: temp, text: t('Running hot: {temp}.', { temp: celsius(r.temp_c) }) });
  for (const d of r.disks) {
    const tone = diskTone(diskPct(d));
    if (tone && tone !== 'good') out.push({ tone, text: t('{disk} is {pct} full.', { disk: d.mount ?? diskName(d.label, t), pct: pct(diskPct(d)) }) });
  }
  const mem = memTone(memPct(r));
  if (mem && mem !== 'good') out.push({ tone: mem, text: t('Memory is {pct} used.', { pct: pct(memPct(r)) }) });
  const cpu = cpuTone(r.cpu.pct);
  if (cpu && cpu !== 'good') out.push({ tone: cpu, text: t('The CPU is {pct} busy.', { pct: pct(r.cpu.pct) }) });
  return out.sort((a, b) => ORDER.indexOf(b.tone) - ORDER.indexOf(a.tone));
}

export const diskName = (label: string, t: Translate = EN): string =>
  label === 'assistant' ? t('Assistant files') : label === 'docker' ? t('Docker data') : label;

/** Beni keeps an eye on the machine. */
export function beni(latest: Latest | null, stale: boolean, hour: number, t: Translate = EN): { mood: Mood; line: string } {
  if (!latest) return { mood: 'idle', line: t('Start the collector and I will watch this machine.') };
  if (stale) return { mood: 'tired', line: t('I lost sight of the machine. Is the collector running?') };
  const p = problems(latest.data, t);
  if (p.length && (p[0].tone === 'critical' || p[0].tone === 'serious')) return { mood: 'tired', line: p[0].text };
  if (p.length) return { mood: 'steady', line: p[0].text };
  if (hour < 6) return { mood: 'asleep', line: t('All quiet. The machine is resting too.') };
  return { mood: hour < 12 ? 'charged' : 'steady', line: t('All good. Nothing is struggling.') };
}

/** "Raspberry Pi 5 · 4 cores · arm64". */
export function hostLine(r: Reading, t: Translate = EN): string {
  const h = r.host;
  const parts = [h.model ?? h.cpu, h.cores ? t.n(h.cores, '{n} core', '{n} cores') : null, h.arch === 'aarch64' ? 'arm64' : h.arch === 'x86_64' ? 'amd64' : h.arch];
  return parts.filter(Boolean).join(' · ');
}

// -- history ------------------------------------------------------------------------------------------

export function series(metric: Metric): { label: string; key: keyof Bucket; hue: string }[] {
  switch (metric) {
    case 'cpu':
      return [{ label: 'CPU', key: 'cpu', hue: 'blue' }];
    case 'memory':
      return [{ label: 'Memory used', key: 'mem_pct', hue: 'violet' }];
    case 'temp':
      return [{ label: 'Temperature', key: 'temp', hue: 'red' }];
    case 'net':
      return [
        { label: 'Download', key: 'rx', hue: 'aqua' },
        { label: 'Upload', key: 'tx', hue: 'orange' }
      ];
    case 'disk':
      return [
        { label: 'Read', key: 'read', hue: 'green' },
        { label: 'Write', key: 'write', hue: 'magenta' }
      ];
  }
}

/** How to print a metric's value. */
export function formatter(metric: Metric, locale = 'en-GB'): (v: number | null) => string {
  if (metric === 'cpu' || metric === 'memory') return (v) => pct(v, locale);
  if (metric === 'temp') return celsius;
  return (v) => rate(v, locale);
}

/** Peak and average of one column over a stretch of history. */
export function summarize(history: Bucket[], key: keyof Bucket): { avg: number | null; max: number | null } {
  const vals = history.map((b) => b[key]).filter((v): v is number => typeof v === 'number');
  if (!vals.length) return { avg: null, max: null };
  return { avg: Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10, max: Math.max(...vals) };
}

/** Every bucket of the range, oldest first, with nulls where nothing was sampled: gaps stay gaps. */
export function fillBuckets(rows: Bucket[], range: Range, now: number): Bucket[] {
  const step = BUCKET[range].minutes * 60_000;
  const end = Math.floor(now / step) * step;
  const start = end - (BUCKET[range].hours * 3_600_000) + step;
  const by = new Map(rows.map((r) => [Math.floor(Date.parse(r.at) / step) * step, r]));
  const out: Bucket[] = [];
  for (let at = start; at <= end; at += step) {
    out.push(
      by.get(at) ?? { at: new Date(at).toISOString(), cpu: null, cpu_max: null, load1: null, mem_pct: null, temp: null, rx: null, tx: null, read: null, write: null }
    );
  }
  return out;
}
