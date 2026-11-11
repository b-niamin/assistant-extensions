/** GET /home/state: a fresh snapshot for the board's auto-refresh. Same data as the page load. */
import { json, type ExtHandler } from '$shell';
import { snapshot } from '../../lib/snapshot.server';

export const GET: ExtHandler = async (_event, ctx) =>
  json(await snapshot(ctx), { headers: { 'cache-control': 'no-store' } });
