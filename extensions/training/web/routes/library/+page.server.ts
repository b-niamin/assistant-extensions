import { fail, redirect, todayIn, type ExtActions, type ExtLoad } from '$shell';
import { deleteCustomEntry, doneWorkouts, fullLibrary, saveCustomEntry } from '../../lib/db.server';
import { MUSCLES } from '../../lib/library';
import { CARDIO_SPORTS, UNITS, type Unit } from '../../lib/model';
import { startWorkout } from '../../lib/start.server';

/** The library, as the gym log's: pictures, muscles, how to, what to avoid, your progress; your own entries. */
export const load = (async (_event, ctx) => {
  const p = ctx.dataProfileId!;
  const [library, history] = await ctx.db((sql) => Promise.all([fullLibrary(sql, p), doneWorkouts(sql, p, 300)]));
  return { library, history };
}) satisfies ExtLoad;

export const actions: ExtActions = {
  save: async ({ request }, ctx) => {
    const f = await request.formData();
    const get = (k: string) => String(f.get(k) ?? '').trim();
    const name = get('name');
    if (!name || name.length > 80) return fail(400, { error: ctx.t('Give it a name.') });
    const kind = get('kind') === 'cardio' ? 'cardio' : 'exercise';
    const id = await ctx.db((sql) =>
      saveCustomEntry(sql, ctx.dataProfileId!, {
        id: get('id') || undefined,
        name,
        kind,
        sport: (CARDIO_SPORTS as readonly string[]).includes(get('sport')) ? get('sport') : 'other',
        unit: UNITS.includes(get('unit') as Unit) ? (get('unit') as Unit) : 'reps',
        muscles: f.getAll('muscles').map(String).filter((m) => m in MUSCLES),
        description: get('description').slice(0, 2000),
        cautions: get('cautions').split('\n')
      })
    );
    return { saved: id };
  },
  remove: async ({ request }, ctx) => {
    const id = String((await request.formData()).get('id') ?? '');
    await ctx.db((sql) => deleteCustomEntry(sql, ctx.dataProfileId!, id));
    return { removed: id };
  },
  /** "Start a workout with this exercise". */
  start: async ({ request }, ctx) => {
    const id = String((await request.formData()).get('id') ?? '');
    const sid = await ctx.db((sql) => startWorkout(sql, ctx.dataProfileId!, todayIn(), { from: 'entry', id }));
    if (!sid) return fail(404, { error: ctx.t('It is not there any more.') });
    throw redirect(303, `/training/session/${sid}`);
  }
};
