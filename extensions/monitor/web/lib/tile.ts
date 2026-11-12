/** The dashboard tile from the latest reading and a day of history, pure (spec 003: data only). */
import type { TileData, TileKpi, Translate } from '$shell';
import { EN } from '$shell';
import { celsius, cpuTone, diskPct, memPct, memTone, problems, uptime } from './monitor';
import type { Bucket, Latest } from './types';

const status = (tone: ReturnType<typeof cpuTone>, t: Translate): TileKpi['status'] =>
  tone && tone !== 'good' ? { label: tone === 'warning' ? t('high') : t('very high'), tone } : undefined;

export function monitorTile(latest: Latest | null, stale: boolean, day: Bucket[], t: Translate = EN): TileData {
  if (!latest) {
    return { empty: { message: t('The collector has not sent a reading yet.'), action: { label: t('How to start it'), href: '/monitor' } } };
  }
  const r = latest.data;
  const mem = memPct(r);
  const cpu: TileKpi = { label: t('CPU'), value: r.cpu.pct, unit: '%', status: status(cpuTone(r.cpu.pct), t) };
  const memory: TileKpi = { label: t('Memory'), value: mem == null ? null : Math.round(mem), unit: '%', status: status(memTone(mem), t) };
  const fullest = Math.max(0, ...r.disks.map((d) => diskPct(d) ?? 0));
  const p = problems(r, t);
  const out: TileData = {
    kpis: [cpu, memory],
    series: { kind: 'line', points: day.map((b) => ({ label: b.at.slice(11, 16), value: b.cpu })), unit: '%', hue: 'blue', caption: t('CPU, last 24 h') }
  };
  const bits = [r.temp_c == null ? null : celsius(r.temp_c), r.disks.length ? t('disk {pct} %', { pct: Math.round(fullest) }) : null, t('up {time}', { time: uptime(r.uptime_s, t) })];
  out.note = stale ? t('No reading since {time}', { time: latest.at.slice(11, 16) }) : p.length ? p[0].text : bits.filter(Boolean).join(' · ');
  return out;
}

/** Groups of `n` buckets averaged into one (the tile's hourly line from 15-minute buckets). */
export function coarsen(h: Bucket[], n: number): Bucket[] {
  const out: Bucket[] = [];
  for (let i = 0; i < h.length; i += n) {
    const chunk = h.slice(i, i + n);
    const vals = chunk.map((b) => b.cpu).filter((v): v is number => v != null);
    out.push({ ...chunk[0], cpu: vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : null });
  }
  return out;
}
