import type { ExtLoad } from '$shell';
import { view } from '../lib/data.server';
import { metricOf, rangeOf } from '../lib/monitor';

export const load = (async ({ url }, ctx) =>
  ({ view: await view(ctx, rangeOf(url.searchParams.get('range')), metricOf(url.searchParams.get('metric'))) })) satisfies ExtLoad;
