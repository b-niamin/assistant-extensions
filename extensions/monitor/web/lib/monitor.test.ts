import { describe, expect, it } from 'vitest';
import { ago, beni, bytes, diskPct, fillBuckets, hostLine, isStale, metricOf, pct, problems, rangeOf, rate, summarize, uptime } from './monitor';
import { coarsen, monitorTile } from './tile';
import { byteTicks, niceTicks } from './ticks';
import type { Bucket, Latest, Reading } from './types';

const GB = 1024 ** 3;

const reading = (over: Partial<Reading> = {}): Reading => ({
  host: { hostname: 'pi', model: 'Raspberry Pi 5 Model B Rev 1.0', cpu: null, cores: 4, arch: 'aarch64', kernel: '6.6', vm: null, boot_time: null },
  uptime_s: 93784,
  interval_s: 30,
  cpu: { pct: 12, per_core: [10, 14, 12, 12], load: [0.5, 0.4, 0.3], mhz: 2400 },
  memory: { total: 8 * GB, available: 6 * GB, used: 2 * GB, cached: GB, swap_total: 0, swap_used: 0 },
  temps: [{ name: 'cpu-thermal', c: 52 }],
  temp_c: 52,
  throttling: null,
  disks: [{ label: 'assistant', mount: '/', fstype: 'ext4', total: 100 * GB, used: 40 * GB, free: 55 * GB }],
  disk_io: { read_bps: 0, write_bps: 1024 },
  net: [{ iface: 'eth0', rx_bps: 2048, tx_bps: 512, rx_total: 1, tx_total: 1 }],
  containers: [],
  top: [],
  ...over
});
const at = '2026-11-11T12:00:00.000Z';
const latest = (over: Partial<Reading> = {}): Latest => ({ at, data: reading(over) });
const bucket = (iso: string, cpu: number | null): Bucket => ({ at: iso, cpu, cpu_max: cpu, load1: null, mem_pct: null, temp: null, rx: null, tx: null, read: null, write: null });

describe('units', () => {
  it('prints bytes in binary steps', () => {
    expect(bytes(512)).toBe('512 B');
    expect(bytes(1536)).toBe('1.5 KB');
    expect(bytes(8 * GB)).toBe('8 GB');
    expect(bytes(null)).toBe('–');
    expect(rate(2048)).toBe('2 KB/s');
  });
  it('prints percentages and uptime', () => {
    expect(pct(4.25)).toBe('4.3 %');
    expect(pct(42.4)).toBe('42 %');
    expect(uptime(93784)).toBe('1 d 2 h');
    expect(uptime(3700)).toBe('1 h 1 min');
    expect(uptime(10)).toBe('1 min');
  });
  it('says how long ago', () => {
    const now = Date.parse(at);
    expect(ago(at, now + 2000)).toBe('now');
    expect(ago(at, now + 40_000)).toBe('40 s ago');
    expect(ago(at, now + 5 * 60_000)).toBe('5 min ago');
  });
  it('counts disk use as df does', () => {
    expect(Math.round(diskPct(reading().disks[0])!)).toBe(42);
  });
  it('describes the machine', () => {
    expect(hostLine(reading())).toBe('Raspberry Pi 5 Model B Rev 1.0 · 4 cores · arm64');
  });
  it('accepts only known ranges and metrics', () => {
    expect(rangeOf('7d')).toBe('7d');
    expect(rangeOf('1y')).toBe('24h');
    expect(metricOf('temp')).toBe('temp');
    expect(metricOf(null)).toBe('cpu');
  });
});

describe('problems and Beni', () => {
  it('is quiet when all is fine', () => {
    expect(problems(reading())).toEqual([]);
    expect(beni(latest(), false, 15).mood).toBe('steady');
    expect(beni(latest(), false, 3).mood).toBe('asleep');
  });
  it('puts the worst first', () => {
    const p = problems(reading({ temp_c: 83, cpu: { pct: 75, per_core: [], load: null, mhz: null } }));
    expect(p.map((x) => x.tone)).toEqual(['serious', 'warning']);
    expect(p[0].text).toBe('Running hot: 83 °C.');
    expect(beni(latest({ temp_c: 83 }), false, 15).mood).toBe('tired');
  });
  it('flags a weak power supply on a Raspberry Pi', () => {
    const p = problems(reading({ throttling: { under_voltage: true, throttled: false, under_voltage_since_boot: true, throttled_since_boot: false } }));
    expect(p[0].tone).toBe('critical');
  });
  it('warns about a full disk by where it is mounted', () => {
    const p = problems(reading({ disks: [{ label: 'assistant', mount: '/volume1', fstype: 'btrfs', total: 100, used: 93, free: 7 }] }));
    expect(p[0]).toEqual({ tone: 'serious', text: '/volume1 is 93 % full.' });
  });
  it('is idle without a reading and tired when the collector stopped', () => {
    expect(beni(null, false, 12).mood).toBe('idle');
    expect(beni(latest(), true, 12).mood).toBe('tired');
  });
  it('calls a reading stale after three passes', () => {
    const now = Date.parse(at);
    expect(isStale(latest(), now + 60_000)).toBe(false);
    expect(isStale(latest(), now + 120_000)).toBe(true);
    expect(isStale(null, now)).toBe(false);
  });
});

describe('history', () => {
  it('fills every bucket of the range so gaps stay gaps', () => {
    const now = Date.parse('2026-11-11T12:00:30Z');
    const h = fillBuckets([bucket('2026-11-11T11:59:00.000Z', 20)], '1h', now);
    expect(h).toHaveLength(60);
    expect(h[h.length - 1].at).toBe('2026-11-11T12:00:00.000Z');
    expect(h[h.length - 2].cpu).toBe(20);
    expect(h[0].cpu).toBeNull();
  });
  it('summarizes a column', () => {
    expect(summarize([bucket(at, 10), bucket(at, null), bucket(at, 30)], 'cpu')).toEqual({ avg: 20, max: 30 });
    expect(summarize([], 'cpu')).toEqual({ avg: null, max: null });
  });
  it('averages buckets into coarser ones', () => {
    const h = [bucket(at, 10), bucket(at, 20), bucket(at, null), bucket(at, 30), bucket(at, null)];
    expect(coarsen(h, 2).map((b) => b.cpu)).toEqual([15, 30, null]);
  });
  it('puts byte ticks on round units', () => {
    expect(niceTicks(0, 95)).toEqual([0, 25, 50, 75, 100]);
    expect(byteTicks(0, 3.5 * 1024 * 1024).map((v) => v / 1024 / 1024)).toEqual([0, 1, 2, 3, 4]);
  });
});

describe('tile', () => {
  it('asks to start the collector before the first reading', () => {
    expect(monitorTile(null, false, []).empty?.action?.href).toBe('/monitor');
  });
  it('shows CPU and memory with a calm note', () => {
    const tile = monitorTile(latest(), false, [bucket(at, 12)]);
    expect(tile.kpis?.map((k) => [k.label, k.value])).toEqual([
      ['CPU', 12],
      ['Memory', 25]
    ]);
    expect(tile.note).toBe('52 °C · disk 42 % · up 1 d 2 h');
    expect(tile.series?.points).toHaveLength(1);
  });
  it('leads with the problem when there is one', () => {
    const tile = monitorTile(latest({ temp_c: 85 }), false, []);
    expect(tile.note).toBe('Running hot: 85 °C.');
  });
});
