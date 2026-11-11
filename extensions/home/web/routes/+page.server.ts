import type { ExtLoad } from '$shell';
import { snapshot } from '../lib/snapshot.server';

export const load = (async (_event, ctx) => ({ snapshot: await snapshot(ctx) })) satisfies ExtLoad;
