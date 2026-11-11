/** The dashboard tile from a snapshot, pure (spec 003: data only, the shell renders it). */
import type { TileData } from '$shell';
import type { Snapshot } from './types';
import { condition } from './weather';

export function homeTile(s: Snapshot): TileData {
  if (!s.ha.configured && !s.weather.configured) {
    return { empty: { message: 'Connect Home Assistant in System settings.', action: { label: 'Connect', href: '/settings/extensions/home' } } };
  }
  const home = s.ha.home;
  const out: TileData = { kpis: [], list: [] };
  if (home) {
    const on = home.lights.active.length;
    const open = home.contacts.active.length;
    out.kpis!.push({ label: 'Lights on', value: on, status: on ? undefined : { label: 'all off', tone: 'good' } });
    out.kpis!.push({
      label: 'Doors & windows open',
      value: open,
      status: open ? { label: 'open', tone: 'warning' } : { label: 'all closed', tone: 'good' }
    });
    for (const a of home.alerts) out.list!.push({ label: a.name, meta: a.active ? 'alert now' : 'alert, recent' });
  } else if (s.ha.error) {
    out.note = s.ha.error;
  }
  for (const w of s.weather.warnings) out.list!.push({ label: w.title, meta: 'weather' });
  for (const e of s.calendar.events) out.list!.push({ label: e.title, meta: e.allDay ? 'today' : e.when.slice(0, 5) });
  const w = s.weather.data;
  if (w) {
    const t = w.current.temp == null ? '–' : `${Math.round(w.current.temp)}°`;
    out.note = `${t} · ${condition(w.current.code).label}${out.note ? ` · ${out.note}` : ''}`;
  }
  if (!out.kpis!.length) delete out.kpis;
  if (!out.list!.length) delete out.list;
  return out;
}
