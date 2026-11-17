/** GET /training/photo/<Free Exercise DB id>/<0|1>: a picture for an own exercise, kept after the first fetch. */
import { error, type ExtHandler } from '$shell';
import { picture } from '../../../../lib/photos.server';

export const GET: ExtHandler = async ({ params }, ctx) => {
  const frame = params.frame === '1' ? 1 : params.frame === '0' ? 0 : null;
  if (frame === null || !params.id) throw error(404, 'Not found');
  const pic = await ctx.db((sql) => picture(sql, ctx.dataProfileId!, params.id!, frame));
  if (!pic) throw error(404, 'No such photo');
  return new Response(pic.bytes as BodyInit, {
    headers: { 'content-type': pic.mime, 'cache-control': 'private, max-age=31536000, immutable', 'x-content-type-options': 'nosniff' }
  });
};
