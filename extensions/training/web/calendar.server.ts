/**
 * Training on the shared calendar (core spec 002, "Calendar entries"): the workouts of the active plan and
 * those of no plan, timed when they have a time, else all day. On the calendar it is one source
 * ("Training"), so it can be switched on or off there.
 */
import { dayIn, instantIn, type CalendarEntry, type ExtCalendar } from '$shell';
import { sessionsIn } from './lib/db.server';
import { itemsLine, minutesOf, SPORT_LABELS } from './lib/model';

export const calendar: ExtCalendar = {
  async entries(ctx, range) {
    if (!ctx.dataProfileId) return [];
    const t = ctx.t;
    const first = dayIn(new Date(range.from.getTime() - 86_400_000), range.timeZone);
    const last = dayIn(new Date(range.to.getTime() + 86_400_000), range.timeZone);
    const sessions = await ctx.db((sql) => sessionsIn(sql, ctx.dataProfileId!, first, last, { limit: 1000, visible: true }));
    return sessions.map((s): CalendarEntry => {
      const what = itemsLine(s.items, t);
      const minutes = minutesOf(s);
      const status = s.status === 'done' ? t('done') : s.status === 'skipped' ? t('skipped') : '';
      const note = [status, what || s.description?.split('\n')[0] || '', minutes ? `${minutes} min` : '']
        .filter(Boolean)
        .join(' · ');
      const base = { id: s.id, title: s.title, kind: t(SPORT_LABELS[s.sport]), href: `/training/session/${s.id}`, ...(note ? { note } : {}) };
      if (!s.time_local) return { ...base, start: s.day };
      const start = instantIn(s.day, s.time_local, range.timeZone);
      return { ...base, start: start.toISOString(), end: new Date(start.getTime() + (minutes ?? 60) * 60_000).toISOString() };
    });
  }
};
