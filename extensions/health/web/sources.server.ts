/**
 * Connected accounts in this extension's System settings panel (spec 002): Garmin with its sync state
 * and progress, and the actions the panel offers. The web app never touches Garmin itself: an action
 * queues a row in health.sync_requests and the garmin-sync service runs it within seconds.
 */
import type { ExtSources } from '$shell';
import { syncOverview } from './lib/sync.server';
import { describeSync, garminSource } from './lib/sync';

const LOGIN = 'docker compose exec -it garmin-sync python -m sync login';

export const sources: ExtSources = {
  async list(ctx) {
    const p = ctx.dataProfileId!;
    const o = await ctx.db((sql) => syncOverview(sql, p));
    const today = new Date().toISOString().slice(0, 10);
    const garmin = garminSource(o, today, LOGIN);
    if (garmin.state !== 'not_connected') garmin.sync = describeSync(o, Date.now());
    return [
      garmin,
      {
        id: 'strava',
        name: 'Strava',
        state: 'planned',
        help: 'Not supported yet. Activities recorded on a Garmin watch already come in through Garmin.'
      }
    ];
  },

  async act(ctx, source, action, input) {
    if (source !== 'garmin') throw new Error('Unknown account.');
    const p = ctx.dataProfileId!;
    if (action !== 'sync-now' && action !== 'fetch-older') throw new Error('Unknown action.');
    const kind = action === 'sync-now' ? 'incremental' : 'backfill';
    const since = action === 'fetch-older' ? input.date : undefined;
    await ctx.db(
      (sql) => sql`
        INSERT INTO health.sync_requests (id, profile_id, source, kind, since)
        VALUES (${crypto.randomUUID().replace(/-/g, '')}, ${p}, 'garmin', ${kind}, ${since ?? null})`
    );
    return kind === 'incremental'
      ? 'Sync queued: it starts within a few seconds.'
      : `Fetching data back to ${since}: it starts within a few seconds and can take a while.`;
  }
};
