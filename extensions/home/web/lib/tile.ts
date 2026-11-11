/** The dashboard tile from a snapshot, pure (spec 003: data only, the shell renders it). */
import type { TileData, Translate } from '$shell';
import { EN } from './i18n';
import type { Snapshot } from './types';
import { condition } from './weather';

export function homeTile(s: Snapshot, t: Translate = EN): TileData {
  if (!s.ha.configured && !s.weather.configured) {
    return { empty: { message: t('Connect Home Assistant in System settings.'), action: { label: t('Connect'), href: '/settings/extensions/home' } } };
  }
  const home = s.ha.home;
  const out: TileData = { kpis: [], list: [] };
  if (home) {
    const on = home.lights.active.length;
    const open = home.contacts.active.length;
    out.kpis!.push({ label: t('Lights on'), value: on, status: on ? undefined : { label: t('all off'), tone: 'good' } });
    out.kpis!.push({
      label: t('Doors & windows open'),
      value: open,
      status: open ? { label: t('open'), tone: 'warning' } : { label: t('all closed'), tone: 'good' }
    });
    for (const a of home.alerts) out.list!.push({ label: a.name, meta: a.active ? t('alert now') : t('alert, recent') });
  } else if (s.ha.error) {
    out.note = s.ha.error;
  }
  for (const w of s.weather.warnings) out.list!.push({ label: w.title, meta: t('weather') });
  for (const e of s.calendar.events) out.list!.push({ label: e.title, meta: e.allDay ? t('today') : e.when.slice(0, 5) });
  const w = s.weather.data;
  if (w) {
    const deg = w.current.temp == null ? '–' : `${Math.round(w.current.temp)}°`;
    out.note = `${deg} · ${t(condition(w.current.code).label)}${out.note ? ` · ${out.note}` : ''}`;
  }
  if (!out.kpis!.length) delete out.kpis;
  if (!out.list!.length) delete out.list;
  return out;
}
