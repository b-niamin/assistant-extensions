/** The dashboard tile from the week's entries, pure (core spec 003: data only, the shell renders it). */
import { EN, type SharedEntry, type TileData, type Translate } from '$shell';
import { clock, daysOf } from './view';

export function upcomingTile(entries: SharedEntry[], today: string, timeZone: string, now: Date, t: Translate = EN): TileData {
  // Still to come: all-day ones of today and later, timed ones not over yet.
  const ahead = entries.filter((e) => (e.allDay ? e.end > today : Date.parse(e.end) > now.getTime() || Date.parse(e.start) >= now.getTime()));
  const onToday = entries.filter((e) => daysOf(e, timeZone).includes(today)).length;
  if (!entries.length) return { empty: { message: t('Nothing on the calendar this week.'), action: { label: t('Add an entry'), href: '/calendar' } } };
  const weekday = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString(t.locale, { weekday: 'short', timeZone: 'UTC' });
  return {
    kpis: [{ label: t('Today'), value: onToday }],
    list: ahead.slice(0, 5).map((e) => {
      const first = daysOf(e, timeZone)[0];
      const day = first <= today ? '' : weekday(first);
      const time = e.allDay ? (day ? '' : t('today')) : clock(e.start, timeZone);
      return { label: e.title, meta: [day, time].filter(Boolean).join(' ') };
    }),
    note: ahead.length ? undefined : t('Nothing more this week')
  };
}
