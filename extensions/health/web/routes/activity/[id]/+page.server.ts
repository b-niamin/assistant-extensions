import { error, fail, type ExtActions, type ExtLoad } from '$shell';
import { activityById } from '../../../lib/activity.server';
import { buildStreams, extrasOf, lapsOf } from '../../../lib/activity';
import { writeLine } from '../../../lib/connectors';
import { queueWrite } from '../../../lib/connectors.server';

const ID = /^[0-9A-Za-z_-]{1,40}$/;

export const load = (async ({ params }, ctx) => {
  const id = params.id ?? '';
  if (!ID.test(id)) throw error(404, 'No such activity');
  const p = ctx.dataProfileId!; // scope "profile": always the viewing profile
  const [d, strava, recent] = await ctx.db((sql) =>
    Promise.all([
      activityById(sql, p, id),
      sql<{ strava_id: string; name: string | null; description: string | null }[]>`
        SELECT strava_id, name, description FROM health.synced_strava_activities
         WHERE profile_id = ${p} AND garmin_activity_id = ${id} LIMIT 1`,
      sql<{ target: string; op: string; state: string; error: string | null }[]>`
        SELECT target, op, state, error FROM health.outbox
         WHERE profile_id = ${p} AND op = 'edit_activity'
           AND (payload->>'activity_id' = ${id}
                OR payload->>'strava_id' IN (SELECT strava_id FROM health.synced_strava_activities WHERE profile_id = ${p} AND garmin_activity_id = ${id}))
         ORDER BY requested_at DESC LIMIT 2`
    ])
  );
  if (!d.activity) throw error(404, 'No such activity');
  const { raw, ...activity } = d.activity;
  return {
    activity,
    description: typeof raw?.description === 'string' ? raw.description : '',
    strava: strava[0] ? { id: strava[0].strava_id, name: strava[0].name, description: strava[0].description } : null,
    writes: recent.map((w) => ({ state: w.state, line: writeLine(w, ctx.t) })),
    extras: extrasOf(raw),
    // Thinned on the server: a long ride has tens of thousands of samples, the page needs a few hundred.
    streams: buildStreams(d.streams, activity.sport),
    laps: lapsOf(d.streams),
    journal: d.journal,
    prev: d.prev,
    next: d.next
  };
}) satisfies ExtLoad;

export const actions: ExtActions = {
  /** Title and description on Garmin and/or Strava: queued for the connectors service. */
  edit: async ({ params, request }, ctx) => {
    const id = params.id ?? '';
    if (!ID.test(id)) return fail(404, { error: ctx.t('No such activity') });
    const f = await request.formData();
    const title = String(f.get('title') ?? '').trim().slice(0, 255);
    const description = String(f.get('description') ?? '').slice(0, 4000);
    if (!title) return fail(400, { error: ctx.t('The title cannot be empty.') });
    const on = f.getAll('on').map(String);
    if (!on.length) return fail(400, { error: ctx.t('Pick Garmin, Strava or both.') });
    const p = ctx.dataProfileId!;
    await ctx.db(async (sql) => {
      const [s] = await sql<{ strava_id: string }[]>`
        SELECT strava_id FROM health.synced_strava_activities WHERE profile_id = ${p} AND garmin_activity_id = ${id} LIMIT 1`;
      if (on.includes('garmin')) await queueWrite(sql, p, 'garmin', 'edit_activity', { activity_id: id, title, description }, 'app');
      if (on.includes('strava') && s) await queueWrite(sql, p, 'strava', 'edit_activity', { strava_id: s.strava_id, title, description }, 'app');
    });
    return { saved: true };
  }
};
