/**
 * Training on the shared calendar (core spec 002, "Calendar entries"): every Garmin activity with its
 * start and length, and what the Garmin calendar has planned (workouts, races), for the viewing profile.
 */
import { instantIn, type CalendarEntry, type ExtCalendar } from '$shell';
import { km, sportLabel } from './lib/format';

const TIME = /^(\d{2}):(\d{2})/;

const minutes = (s: number | null) => (s && s > 0 ? `${Math.round(s / 60)} min` : '');

export const calendar: ExtCalendar = {
  async entries(ctx, range) {
    if (!ctx.dataProfileId) return [];
    const t = ctx.t;
    const [acts, plans] = await ctx.db((sql) =>
      Promise.all([
        sql<{ activity_id: string; sport: string; name: string | null; start_time: Date; duration_s: number | null; distance_m: number | null }[]>`
          SELECT activity_id, sport, name, start_time, duration_s, distance_m
            FROM health.synced_activities
           WHERE profile_id = ${ctx.dataProfileId}
             AND start_time < ${range.to}
             AND start_time + make_interval(secs => coalesce(duration_s, 0)) >= ${range.from}
           ORDER BY start_time LIMIT 1000`,
        sql<{ event_id: string; day: string; time_local: string | null; kind: string; title: string | null; sport: string | null; description: string | null; duration_s: number | null; distance_m: number | null }[]>`
          SELECT event_id, day::text AS day, time_local, kind, title, sport, description, duration_s, distance_m
            FROM health.synced_planned_events
           WHERE profile_id = ${ctx.dataProfileId}
             AND day BETWEEN (${range.from}::timestamptz - interval '1 day')::date AND (${range.to}::timestamptz + interval '1 day')::date
           ORDER BY day LIMIT 500`
      ])
    );
    const out: CalendarEntry[] = [];
    for (const a of acts) {
      const start = new Date(a.start_time);
      const sport = t(sportLabel(a.sport));
      out.push({
        id: `a:${a.activity_id}`,
        title: a.name?.trim() || sport,
        start: start.toISOString(),
        end: new Date(start.getTime() + Math.max(0, a.duration_s ?? 0) * 1000).toISOString(),
        kind: sport,
        note: [a.distance_m ? km(a.distance_m, t.locale) : '', minutes(a.duration_s)].filter(Boolean).join(' · ') || undefined,
        href: `/health/activity/${encodeURIComponent(a.activity_id)}`
      });
    }
    for (const p of plans) {
      const what = p.kind === 'race' ? t('Race') : p.kind === 'note' ? t('Garmin note') : t('Planned workout');
      const title = p.title?.trim() || (p.sport ? t(sportLabel(p.sport)) : what);
      const m = p.time_local ? TIME.exec(p.time_local) : null;
      const base = {
        id: `p:${p.event_id}`,
        title,
        kind: what,
        note: [p.description?.trim() ?? '', p.distance_m ? km(p.distance_m, t.locale) : '', minutes(p.duration_s)].filter(Boolean).join(' · ') || undefined,
        href: '/health'
      };
      if (m) {
        const start = instantIn(p.day, `${m[1]}:${m[2]}`, range.timeZone);
        out.push({ ...base, start: start.toISOString(), end: new Date(start.getTime() + Math.max(0, p.duration_s ?? 0) * 1000).toISOString() });
      } else out.push({ ...base, start: p.day });
    }
    return out;
  }
};
