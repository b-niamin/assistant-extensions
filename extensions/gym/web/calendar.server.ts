/**
 * The gym log on the shared calendar (core spec 002, "Calendar entries"): each workout on its day, with
 * its time when the app timed it (started and finished in the app), else all day. Read from the same
 * localStorage document as the tools (`gym-notebook.v1`), nothing copied.
 */
import { dayIn, type CalendarEntry, type ExtCalendar } from '$shell';

const KEY = 'gym-notebook.v1';
const DAY = /^\d{4}-\d{2}-\d{2}$/;

interface Doc {
  kind?: string;
  date?: string;
  done?: boolean;
  /** Example data loaded on request in the app's settings: never on the calendar. */
  sample?: boolean;
  planName?: string;
  startedAt?: number | null;
  finishedAt?: number | null;
  exercises?: { name?: string; sets?: { reps?: string; done?: boolean }[] }[];
}

export const calendar: ExtCalendar = {
  async entries(ctx, range) {
    let docs: Record<string, Doc> = {};
    try {
      docs = JSON.parse((await ctx.kv.get(KEY)) ?? 'null')?.docs ?? {};
    } catch {
      return [];
    }
    // A day early and late: a timed workout near midnight can fall on the neighbouring local day.
    const first = dayIn(new Date(range.from.getTime() - 86_400_000), range.timeZone);
    const last = dayIn(new Date(range.to.getTime() + 86_400_000), range.timeZone);
    const out: CalendarEntry[] = [];
    for (const [id, d] of Object.entries(docs)) {
      if (!d || typeof d !== 'object' || d.kind || d.sample || !d.date || !DAY.test(d.date) || d.date < first || d.date > last) continue;
      const names = (d.exercises ?? []).map((e) => String(e?.name ?? '').trim()).filter(Boolean);
      const sets = (d.exercises ?? []).reduce((n, e) => n + (e?.sets ?? []).filter((s) => Number(s?.reps) > 0).length, 0);
      const title = (d.planName?.trim() || ctx.t('Workout')) + (d.done ? '' : ` (${ctx.t('in progress')})`);
      const note = [names.slice(0, 8).join(', ') + (names.length > 8 ? ', …' : ''), sets ? ctx.t.n(sets, '{n} set', '{n} sets') : '']
        .filter(Boolean)
        .join(' · ');
      const timed = typeof d.startedAt === 'number' && typeof d.finishedAt === 'number' && d.finishedAt >= d.startedAt;
      out.push({
        id,
        title,
        kind: ctx.t('Workout'),
        href: '/gym',
        ...(note ? { note } : {}),
        ...(timed
          ? { start: new Date(d.startedAt as number).toISOString(), end: new Date(d.finishedAt as number).toISOString() }
          : { start: d.date })
      });
    }
    return out;
  }
};
