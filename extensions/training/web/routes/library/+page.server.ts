import { fail, type ExtActions, type ExtLoad } from '$shell';
import { deleteCustomEntry, fullLibrary, saveCustomEntry } from '../../lib/db.server';
import { MUSCLES } from '../../lib/library';
import { CARDIO_SPORTS, UNITS, type Unit } from '../../lib/model';

/** The library: built-in entries and the profile's own; add, change or delete its own. */
export const load = (async (_event, ctx) => ({ library: await ctx.db((sql) => fullLibrary(sql, ctx.dataProfileId!)) })) satisfies ExtLoad;

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
  }
};
