/**
 * Tools for the AI (spec 005 of the core), as `monitor__<tool>` on the assistant's MCP server. Read-only:
 * the extension watches the machine and changes nothing. The shell adds `describe` and `query` over the
 * monitor schema (monitor.snapshot, monitor.samples) for anything these do not cover.
 */
import type { ExtTool } from '$shell';
import { history, latest } from './lib/data.server';
import { BUCKET, diskName, diskPct, isStale, memPct, problems, RANGES, summarize } from './lib/monitor';
import type { Range } from './lib/types';

const round = (v: number | null) => (v == null ? null : Math.round(v * 10) / 10);

export const tools: ExtTool[] = [
  {
    name: 'overview',
    title: 'The machine now',
    readOnly: true,
    description:
      'The machine the assistant runs on, right now: model, CPU, cores, architecture, uptime; CPU use (per core and ' +
      'load average), memory and swap, temperatures (every sensor and the main one), disks (size, used, free), disk ' +
      'and network throughput, every container (CPU as a share of the whole machine, memory) and the busiest ' +
      'processes; plus what looks wrong and the last 24 hours in short (average and peak CPU, memory, temperature). ' +
      'Byte figures are bytes, rates bytes per second. On a Mac with Docker Desktop or OrbStack the figures are ' +
      "the Linux VM's (`host.vm`). Read-only.",
    input: { type: 'object', properties: {} },
    run: (_args, ctx) =>
      ctx.db(async (sql) => {
        const [l, day] = await Promise.all([latest(sql), history(sql, '24h')]);
        if (!l) {
          return {
            reading: null,
            note: 'No reading yet: the collector is not running. It runs in the assistant\'s worker (System settings -> Worker), which needs the assistant from 2026-11-12 or newer; /worker/logs/monitor.collector.log says why it stopped.'
          };
        }
        const r = l.data;
        return {
          at: l.at,
          stale: isStale(l, Date.now()),
          problems: problems(r),
          ...r,
          memory: r.memory ? { ...r.memory, used_pct: round(memPct(r)) } : null,
          disks: r.disks.map((d) => ({ ...d, name: diskName(d.label), used_pct: round(diskPct(d)) })),
          last24h: {
            cpu_pct: summarize(day, 'cpu'),
            cpu_peak_pct: summarize(day, 'cpu_max').max,
            memory_pct: summarize(day, 'mem_pct'),
            temp_c: summarize(day, 'temp'),
            net_rx_bps: summarize(day, 'rx'),
            net_tx_bps: summarize(day, 'tx')
          }
        };
      })
  },
  {
    name: 'history',
    title: 'Machine history',
    readOnly: true,
    description:
      'History of the machine over a range: `1h` (1-minute buckets), `24h` (15 min), `7d` (2 h) or `30d` (8 h). ' +
      'Each bucket has average CPU % and peak CPU %, load average, memory used %, temperature °C, network ' +
      'download/upload and disk read/write in bytes per second; null where nothing was sampled (machine or ' +
      'collector off). Also average and peak per column over the whole range.',
    input: {
      type: 'object',
      properties: { range: { type: 'string', enum: RANGES, description: 'Default 24h.' } }
    },
    run: (args, ctx) =>
      ctx.db(async (sql) => {
        const range: Range = RANGES.includes(args.range as Range) ? (args.range as Range) : '24h';
        const buckets = await history(sql, range);
        const cols = ['cpu', 'cpu_max', 'load1', 'mem_pct', 'temp', 'rx', 'tx', 'read', 'write'] as const;
        return {
          range,
          bucket_minutes: BUCKET[range].minutes,
          summary: Object.fromEntries(cols.map((c) => [c, summarize(buckets, c)])),
          buckets: buckets.filter((b) => b.cpu !== null || b.mem_pct !== null)
        };
      })
  }
];
