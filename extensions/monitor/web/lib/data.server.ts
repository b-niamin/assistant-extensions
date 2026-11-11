/** Reads of the monitor schema (role ext_monitor). The collector is the only writer. */
import type { ExtensionContext, Sql } from '$shell';
import { BUCKET, fillBuckets, isStale } from './monitor';
import type { Bucket, Latest, Metric, Range, Reading, View } from './types';

export async function latest(sql: Sql): Promise<Latest | null> {
  const rows = await sql<{ at: Date; data: Reading | string }[]>`SELECT at, data FROM monitor.snapshot WHERE id = 1`;
  if (!rows[0]) return null;
  const data = typeof rows[0].data === 'string' ? (JSON.parse(rows[0].data) as Reading) : rows[0].data;
  return { at: rows[0].at.toISOString(), data };
}

/** Averages per bucket over the range (BUCKET), every bucket present. */
export async function history(sql: Sql, range: Range, now = Date.now()): Promise<Bucket[]> {
  const { hours, minutes } = BUCKET[range];
  const rows = await sql<(Omit<Bucket, 'at'> & { at: Date })[]>`
    SELECT date_bin(make_interval(mins => ${minutes}::int), at, 'epoch'::timestamptz) AS at,
           avg(cpu_pct)::float8 AS cpu, max(cpu_pct)::float8 AS cpu_max, avg(load1)::float8 AS load1,
           avg(100.0 * mem_used / NULLIF(mem_total, 0))::float8 AS mem_pct, avg(temp_c)::float8 AS temp,
           avg(net_rx_bps)::float8 AS rx, avg(net_tx_bps)::float8 AS tx,
           avg(disk_read_bps)::float8 AS read, avg(disk_write_bps)::float8 AS write
      FROM monitor.samples
     WHERE at > now() - make_interval(hours => ${hours}::int)
     GROUP BY 1 ORDER BY 1`;
  const round = (v: number | null) => (v == null ? null : Math.round(v * 10) / 10);
  return fillBuckets(
    rows.map((r) => ({
      at: r.at.toISOString(),
      cpu: round(r.cpu),
      cpu_max: round(r.cpu_max),
      load1: r.load1 == null ? null : Math.round(r.load1 * 100) / 100,
      mem_pct: round(r.mem_pct),
      temp: round(r.temp),
      rx: round(r.rx),
      tx: round(r.tx),
      read: round(r.read),
      write: round(r.write)
    })),
    range,
    now
  );
}

/** Everything the page shows: the latest reading and the history of one range. */
export async function view(ctx: ExtensionContext, range: Range, metric: Metric): Promise<View> {
  const now = Date.now();
  const [l, h] = await ctx.db((sql) => Promise.all([latest(sql), history(sql, range, now)]));
  return { at: new Date(now).toISOString(), latest: l, stale: isStale(l, now), range, metric, history: h };
}
