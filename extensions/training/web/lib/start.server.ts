/** Starting a workout now, as the gym log did: empty, again (last one), from a template, a copy, or a run. */
import type { Sql } from '$shell';
import { counted } from './gym';
import { doneWorkouts, fullLibrary, insertSession, sessionById, templateById, touchTemplate } from './db.server';
import { itemFrom, libraryById } from './library';
import { cleanItems, type Item } from './model';

/** The items without values or ticks, as many sets as were done (the page shows last time's as hints). */
export const blank = (items: Item[]): Item[] =>
  items.map((i) =>
    i.kind === 'cardio'
      ? { ...i, done: undefined }
      : { ...i, sets: Array.from({ length: Math.max(1, counted(i).length || i.sets.length) }, () => ({})) }
  );
/** The items with their values, nothing ticked. */
export const copied = (items: Item[]): Item[] =>
  items
    .map((i) => (i.kind === 'cardio' ? { ...i, done: undefined } : { ...i, sets: (counted(i).length ? counted(i) : i.sets).map((s) => ({ ...s, done: undefined })) }))
    .filter((i) => i.kind === 'cardio' || i.sets.length);

export type StartFrom = { from: 'empty' } | { from: 'repeat' } | { from: 'template'; id: string } | { from: 'copy'; id: string } | { from: 'entry'; id: string };

/** A new workout on `day`, started now; returns its id (null when the source is gone). */
export async function startWorkout(sql: Sql, p: string, day: string, src: StartFrom, planId: string | null = null): Promise<string | null> {
  let items: Item[] = [];
  let title: string | undefined;
  if (src.from === 'repeat') {
    const [last] = await doneWorkouts(sql, p, 1);
    if (!last) return null;
    items = blank(last.items);
  } else if (src.from === 'template') {
    const tpl = await templateById(sql, p, src.id);
    if (!tpl) return null;
    items = tpl.items;
    title = tpl.name;
    await touchTemplate(sql, p, src.id);
  } else if (src.from === 'copy') {
    const s = await sessionById(sql, p, src.id);
    if (!s) return null;
    items = copied(s.items);
  } else if (src.from === 'entry') {
    const e = libraryById(src.id, await fullLibrary(sql, p));
    if (!e) return null;
    items = [itemFrom(e)];
  }
  return insertSession(sql, p, { day, items: cleanItems(items), plan_id: planId, ...(title ? { title } : {}) }, { result: { started_at: new Date().toISOString() } });
}

