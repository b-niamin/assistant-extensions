import type { ExtLoad } from '$shell';
import { latestReadings, metricSeries, recentActivities, recentSeries, syncStatus } from '../lib/health.server';
import { METRIC_KEYS, type MetricKey } from '../lib/metrics';

const RANGES = [30, 90, 365];
/** The stat tiles across the top, in reading order. */
const TILES: MetricKey[] = ['sleep', 'hrv', 'body_battery', 'resting_heart_rate', 'stress', 'steps'];

export const load = (async ({ url }, ctx) => {
  const metricParam = url.searchParams.get('metric') ?? 'hrv';
  const metric: MetricKey = (METRIC_KEYS as string[]).includes(metricParam) ? (metricParam as MetricKey) : 'hrv';
  const daysParam = Number(url.searchParams.get('days'));
  const days = RANGES.includes(daysParam) ? daysParam : 30;
  const p = ctx.dataProfileId!; // scope "profile": always the viewing profile
  const [latest, series, trends, activities, sync] = await ctx.db((sql) =>
    Promise.all([
      latestReadings(sql, p),
      metricSeries(sql, p, metric, days),
      recentSeries(sql, p, ['training_readiness', ...TILES], 14),
      recentActivities(sql, p),
      syncStatus(sql, p)
    ])
  );
  return { latest, series, trends, tiles: TILES, activities, sync, metric, days, ranges: RANGES };
}) satisfies ExtLoad;
