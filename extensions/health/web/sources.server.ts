/**
 * Connected accounts in this extension's System settings panel (spec 002): Garmin with its sync state
 * and progress, and the actions the panel offers. The web app never touches Garmin itself: an action
 * queues a row in health.sync_requests and the garmin-sync service runs it within seconds.
 */
import { todayIn, type ExtSources } from '$shell';
import { syncOverview } from './lib/sync.server';
import { describeSync, garminSource, longDay, olderLimit } from './lib/sync';

// Run by the panel's button in the app's terminal; ext-run reaches the worker (shell 4).
const login = (profile: string) => `ext-run health garmin-sync python -m sync login --profile ${profile}`;

export const sources: ExtSources = {
  async list(ctx) {
    const p = ctx.dataProfileId!;
    const o = await ctx.db((sql) => syncOverview(sql, p));
    const today = todayIn();
    const garmin = garminSource(o, today, login(p), Date.now(), ctx.t);
    if (garmin.state !== 'not_connected') garmin.sync = describeSync(o, Date.now(), ctx.t);
    return [
      garmin,
      {
        id: 'strava',
        name: 'Strava',
        state: 'planned',
        help: ctx.t('Not supported yet. Activities recorded on a Garmin watch already come in through Garmin.')
      }
    ];
  },

  async act(ctx, source, action, input) {
    if (source !== 'garmin') throw new Error(ctx.t('Unknown account.'));
    const p = ctx.dataProfileId!;
    if (action !== 'sync-now' && action !== 'fetch-older') throw new Error(ctx.t('Unknown action.'));
    const kind = action === 'sync-now' ? 'incremental' : 'backfill';
    const since = action === 'fetch-older' ? input.date : undefined;
    if (since) {
      const o = await ctx.db((sql) => syncOverview(sql, p));
      const limit = olderLimit(o, todayIn());
      if (since > limit) throw new Error(ctx.t('History is already checked back to {day}: pick an earlier day.', { day: longDay(o.historyTo ?? limit, ctx.t.locale) }));
    }
    // A request the service never picked up is replaced, not stacked behind.
    await ctx.db(async (sql) => {
      await sql`DELETE FROM health.sync_requests WHERE profile_id = ${p} AND source = 'garmin' AND started_at IS NULL`;
      await sql`
        INSERT INTO health.sync_requests (id, profile_id, source, kind, since)
        VALUES (${crypto.randomUUID().replace(/-/g, '')}, ${p}, 'garmin', ${kind}, ${since ?? null})`;
    });
    return kind === 'incremental'
      ? ctx.t('Sync queued: it starts within a few seconds.')
      : ctx.t('Fetching data back to {day}: it starts within a few seconds and can take a while.', { day: longDay(since!, ctx.t.locale) });
  }
};
