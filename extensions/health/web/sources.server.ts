/**
 * Connected accounts in this extension's System settings panel (spec 002): Garmin with its sync state
 * and progress, and the actions the panel offers. The web app never touches Garmin itself: an action
 * queues a row in health.sync_requests and the garmin-sync service runs it within seconds.
 */
import { todayIn, type ExtSources } from '$shell';
import { providerSource, type Provider } from './lib/connectors';
import { providerInfo, requestSync, setOption } from './lib/connectors.server';
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
    const [strava, withings] = await ctx.db((sql) => Promise.all([providerInfo(sql, p, 'strava'), providerInfo(sql, p, 'withings')]));
    return [garmin, providerSource('strava', strava, p, ctx.t), providerSource('withings', withings, p, ctx.t)];
  },

  async act(ctx, source, action, input) {
    const p = ctx.dataProfileId!;
    if (source === 'strava' || source === 'withings') {
      const provider = source as Provider;
      if (action === 'sync-now') {
        await ctx.db((sql) => requestSync(sql, p, provider));
        return ctx.t('Sync queued: it starts within a few seconds.');
      }
      if (provider === 'withings' && (action === 'garmin-on' || action === 'garmin-off')) {
        const on = action === 'garmin-on';
        await ctx.db((sql) => setOption(sql, p, 'withings_to_garmin', { on, since: new Date().toISOString() }));
        return on ? ctx.t('New Withings weigh-ins now go to Garmin too.') : ctx.t('Withings weigh-ins no longer go to Garmin.');
      }
      throw new Error(ctx.t('Unknown action.'));
    }
    if (source !== 'garmin') throw new Error(ctx.t('Unknown account.'));
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
