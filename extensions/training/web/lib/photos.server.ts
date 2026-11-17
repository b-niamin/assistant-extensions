/** The pictures of an own exercise's photo: fetched once from the Free Exercise DB, then kept in training.photos. */
import type { Sql } from '$shell';
import { isPhoto, sourceUrl } from './photos';

const MAX_BYTES = 1_500_000;

export interface Picture {
  mime: string;
  bytes: Uint8Array;
}

async function download(id: string, frame: 0 | 1): Promise<Picture | null> {
  try {
    const res = await fetch(sourceUrl(id, frame), { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    const mime = (res.headers.get('content-type') ?? '').split(';')[0].trim();
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (!bytes.length || bytes.length > MAX_BYTES) return null;
    return { mime: /^image\/(jpeg|png|webp|gif)$/.test(mime) ? mime : 'image/jpeg', bytes };
  } catch {
    return null;
  }
}

/** One picture: the kept one, else fetched and kept. Null when the source cannot be reached. */
export async function picture(sql: Sql, p: string, id: string, frame: 0 | 1): Promise<Picture | null> {
  if (!isPhoto(id)) return null;
  const [row] = await sql`SELECT mime, bytes FROM training.photos WHERE profile_id = ${p} AND source_id = ${id} AND frame = ${frame}`;
  if (row) return { mime: String(row.mime), bytes: new Uint8Array(row.bytes as Uint8Array) };
  const got = await download(id, frame);
  if (got)
    await sql`
      INSERT INTO training.photos (profile_id, source_id, frame, mime, bytes) VALUES (${p}, ${id}, ${frame}, ${got.mime}, ${got.bytes})
      ON CONFLICT (profile_id, source_id, frame) DO NOTHING`;
  return got;
}

/** Fetches both pictures ahead (when an entry gets its photo), so they show at once and offline. True when both are there. */
export async function keepPhoto(sql: Sql, p: string, id: string): Promise<boolean> {
  const [a, b] = await Promise.all([picture(sql, p, id, 0), picture(sql, p, id, 1)]);
  return Boolean(a && b);
}
