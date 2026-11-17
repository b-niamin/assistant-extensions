/**
 * The photos of exercises: the built-in ones ship as web/lib/img/<id>_0|1.webp, made from the Free Exercise
 * DB (github.com/yuhonas/free-exercise-db, public domain). An own exercise picks a photo from the same
 * database by its id (photos.json: [id, name, equipment, main muscle] of its 873 exercises with two pictures);
 * the server fetches both pictures once and keeps them (photos.server.ts). Server side only: the pages ask
 * /training/photos and show /training/photo/<id>/<frame> (gym.ts imageOf).
 */
import index from './photos.json';

export interface PhotoChoice {
  /** The Free Exercise DB id, what an own entry stores as `photo`. */
  photo: string;
  name: string;
  equipment: string;
  muscle: string;
}

const ALL: PhotoChoice[] = (index as string[][]).map(([photo, name, equipment, muscle]) => ({ photo, name, equipment, muscle }));
const IDS = new Set(ALL.map((c) => c.photo));

export const isPhoto = (id: unknown): id is string => typeof id === 'string' && IDS.has(id);

/** Where the server fetches it from. */
export const sourceUrl = (id: string, frame: 0 | 1): string =>
  `https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/${encodeURIComponent(id)}/${frame}.jpg`;

const words = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

/**
 * Photos whose name, equipment or muscle has every word of the query (a word may be the start of one, so
 * "curl" finds "curls"), the ones whose name starts with it first, then the shorter names.
 */
export function searchPhotos(q: string, limit = 30): PhotoChoice[] {
  const qs = words(q);
  if (!qs.length) return [];
  const hits: { c: PhotoChoice; score: number }[] = [];
  for (const c of ALL) {
    const name = words(c.name);
    const all = [...name, ...words(c.equipment), ...words(c.muscle)];
    if (!qs.every((w) => all.some((x) => x.startsWith(w)))) continue;
    const inName = qs.filter((w) => name.some((x) => x.startsWith(w))).length;
    hits.push({ c, score: inName * 100 + (name[0]?.startsWith(qs[0]) ? 50 : 0) - c.name.length });
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, limit).map((h) => h.c);
}
