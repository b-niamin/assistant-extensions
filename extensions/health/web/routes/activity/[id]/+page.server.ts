import { error, type ExtLoad } from '$shell';
import { activityById } from '../../../lib/activity.server';
import { buildStreams, extrasOf, lapsOf } from '../../../lib/activity';

export const load = (async ({ params }, ctx) => {
  const id = params.id ?? '';
  if (!/^[0-9A-Za-z_-]{1,40}$/.test(id)) throw error(404, 'No such activity');
  const p = ctx.dataProfileId!; // scope "profile": always the viewing profile
  const d = await ctx.db((sql) => activityById(sql, p, id));
  if (!d.activity) throw error(404, 'No such activity');
  const { raw, ...activity } = d.activity;
  return {
    activity,
    extras: extrasOf(raw),
    // Thinned on the server: a long ride has tens of thousands of samples, the page needs a few hundred.
    streams: buildStreams(d.streams, activity.sport),
    laps: lapsOf(d.streams),
    journal: d.journal,
    prev: d.prev,
    next: d.next
  };
}) satisfies ExtLoad;
