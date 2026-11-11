/** Dashboard tile of the home extension (spec 003): lights, doors and windows, alerts, today. */
import type { ExtTile } from '$shell';
import { snapshot } from './lib/snapshot.server';
import { homeTile } from './lib/tile';

export const tiles: ExtTile[] = [
  {
    id: 'house',
    title: 'Home',
    size: 'md',
    load: async (ctx) => homeTile(await snapshot(ctx, { quick: true }))
  }
];
