/** GET /monitor/state?range=24h&metric=cpu: a fresh view for the page's auto-refresh. Same data as the load. */
import { json, type ExtHandler } from '$shell';
import { view } from '../../lib/data.server';
import { metricOf, rangeOf } from '../../lib/monitor';

export const GET: ExtHandler = async ({ url }, ctx) =>
  json(await view(ctx, rangeOf(url.searchParams.get('range')), metricOf(url.searchParams.get('metric'))), {
    headers: { 'cache-control': 'no-store' }
  });
