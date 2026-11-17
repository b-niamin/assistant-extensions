import type { ExtLoad } from '$shell';
import { ownPhotos } from '../lib/db.server';

/** Every page shows pictures of own exercises too: own entry id -> its photo (lib/gym.ts imageOf). */
export const load = (async (_event, ctx) => ({
  ownPhotos: ctx.dataProfileId ? await ctx.db((sql) => ownPhotos(sql, ctx.dataProfileId!)) : {}
})) satisfies ExtLoad;
