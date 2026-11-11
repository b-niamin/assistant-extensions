/** Dashboard tile of the monitor extension (spec 003): CPU and memory now, CPU over the day. */
import type { ExtTile } from '$shell';
import { history, latest } from './lib/data.server';
import { isStale } from './lib/monitor';
import { coarsen, monitorTile } from './lib/tile';

export const tiles: ExtTile[] = [
  {
    id: 'machine',
    title: 'System',
    size: 'md',
    load: async (ctx) => {
      const [l, h] = await ctx.db((sql) => Promise.all([latest(sql), history(sql, '24h')]));
      // Hourly points: the tile's line is a trend glyph, 24 of them read better than 96.
      return monitorTile(l, isStale(l, Date.now()), coarsen(h, 4), ctx.t);
    }
  }
];
