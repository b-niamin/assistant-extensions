/** Pure helpers for the page and the tile: the week grid, counts, the tile data. */
import { EN, type TileData, type Translate } from '$shell';
import { addDays, minutesOf, mondayOf, SPORT_LABELS, type Session } from './model';

export interface DayColumn {
  day: string;
  sessions: Session[];
}

/** Seven days from the Monday of `day`, each with its sessions in order. */
export function weekOf(day: string, sessions: Session[]): DayColumn[] {
  const monday = mondayOf(day);
  return Array.from({ length: 7 }, (_, i) => {
    const d = addDays(monday, i);
    return { day: d, sessions: sessions.filter((s) => s.day === d) };
  });
}

/**
 * A week's name for its header, Monday to Sunday: "Mon 16 – Sun 22" in today's month, else with the month
 * ("26 Oct – 1 Nov"), and with the year when it is not this one.
 */
export function weekRange(monday: string, today: string, locale = 'en'): string {
  const sunday = addDays(monday, 6);
  const plain = monday.slice(0, 7) === today.slice(0, 7) && sunday.slice(0, 7) === today.slice(0, 7);
  const end = (d: string) => {
    const at = new Date(`${d}T12:00:00Z`);
    if (plain) return `${at.toLocaleDateString(locale, { timeZone: 'UTC', weekday: 'short' })} ${at.getUTCDate()}`;
    return at.toLocaleDateString(locale, { timeZone: 'UTC', day: 'numeric', month: 'short', ...(d.slice(0, 4) !== today.slice(0, 4) ? { year: 'numeric' } : {}) });
  };
  return `${end(monday)} – ${end(sunday)}`;
}

export function weekCounts(sessions: Session[]) {
  const planned = sessions.length;
  const done = sessions.filter((s) => s.status === 'done').length;
  const minutes = sessions.filter((s) => s.status === 'done').reduce((n, s) => n + (minutesOf(s) ?? 0), 0);
  return { planned, done, minutes };
}

export function weekTile(sessions: Session[], today: string, t: Translate = EN): TileData {
  const monday = mondayOf(today);
  const thisWeek = sessions.filter((s) => s.day >= monday && s.day <= addDays(monday, 6));
  const next = sessions.filter((s) => s.status === 'planned' && s.day >= today).slice(0, 4);
  if (!thisWeek.length && !next.length) return { empty: { message: t('No workouts planned. Ask Claude for a plan, or add one on the page.') } };
  const c = weekCounts(thisWeek);
  return {
    kpis: [
      { label: t('Done'), value: c.done },
      { label: t('Still to do'), value: thisWeek.filter((s) => s.status === 'planned').length }
    ],
    list: next.map((s) => ({
      label: `${s.title} · ${t(SPORT_LABELS[s.sport])}`,
      meta: s.day === today ? t('today') : new Date(`${s.day}T12:00:00Z`).toLocaleDateString(t.locale, { weekday: 'short', day: 'numeric', timeZone: 'UTC' })
    }))
  };
}
