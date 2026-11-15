/**
 * The training plan on the shared calendar (core spec 002, "Calendar entries"): every session of the
 * viewing profile, timed when it has a time, else all day. On the calendar it is one source ("Training
 * plan"), so it can be switched on or off there; runs and gym sessions alike.
 */
import { dayIn, instantIn, type CalendarEntry, type ExtCalendar } from '$shell';
import { sessionsIn } from './lib/db.server';
import { exerciseLine, SPORT_LABELS, stepsLine } from './lib/model';

export const calendar: ExtCalendar = {
  async entries(ctx, range) {
    if (!ctx.dataProfileId) return [];
    const t = ctx.t;
    const first = dayIn(new Date(range.from.getTime() - 86_400_000), range.timeZone);
    const last = dayIn(new Date(range.to.getTime() + 86_400_000), range.timeZone);
    const sessions = await ctx.db((sql) => sessionsIn(sql, ctx.dataProfileId!, first, last, { limit: 1000 }));
    return sessions.map((s): CalendarEntry => {
      const what = s.exercises?.length ? s.exercises.slice(0, 6).map(exerciseLine).join(', ') : stepsLine(s.steps, t);
      const status = s.status === 'done' ? t('done') : s.status === 'skipped' ? t('skipped') : '';
      const note = [status, what || s.description?.split('\n')[0] || '', s.duration_min ? `${s.duration_min} min` : '']
        .filter(Boolean)
        .join(' · ');
      const base = { id: s.id, title: s.title, kind: t(SPORT_LABELS[s.sport]), href: `/training/session/${s.id}`, ...(note ? { note } : {}) };
      if (!s.time_local) return { ...base, start: s.day };
      const start = instantIn(s.day, s.time_local, range.timeZone);
      return { ...base, start: start.toISOString(), end: new Date(start.getTime() + (s.duration_min ?? 60) * 60_000).toISOString() };
    });
  }
};
