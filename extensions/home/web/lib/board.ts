/** What the board says, pure: Beni's mood and line, short labels, "x min ago". */
import type { Translate } from '$shell';
import type { Mood } from '$shell/ui';
import { EN } from '$shell';
import type { Group } from './home';
import type { Snapshot } from './types';

/** Beni keeps watch: alert -> on its toes, something open or on at night -> tired, all quiet -> by the hour. */
export function beni(s: Snapshot, hour: number, t: Translate = EN): { mood: Mood; line: string } {
  const home = s.ha.home;
  if (!s.ha.configured && !s.weather.configured) return { mood: 'idle', line: t('Connect Home Assistant and I will keep an eye on the house.') };
  if (s.ha.error) return { mood: 'tired', line: t('I cannot reach Home Assistant right now.') };
  if (home?.alerts.some((a) => a.active)) return { mood: 'charged', line: t('Something is happening. Take a look.') };
  const open = home?.contacts.active.length ?? 0;
  const on = home?.lights.active.length ?? 0;
  const night = hour >= 23 || hour < 6;
  if (open) return { mood: night ? 'tired' : 'steady', line: open === 1 ? t('{name} is open.', { name: home!.contacts.active[0].name }) : t.n(open, '{n} door or window is open.', '{n} doors or windows are open.') };
  if (on && night) return { mood: 'tired', line: on === 1 ? t('{name} is still on.', { name: home!.lights.active[0].name }) : t.n(on, '{n} light is still on.', '{n} lights are still on.') };
  if (night) return { mood: 'asleep', line: t('All quiet. Lights off, everything closed.') };
  return { mood: hour < 12 ? 'charged' : 'steady', line: home ? t('All quiet at home.') : t('Here is the weather.') };
}

export function lightsLabel(g: Group | undefined, t: Translate = EN): string {
  if (!g) return '–';
  if (!g.total) return t('no lights');
  return g.active.length ? t('{n} on', { n: g.active.length }) : t('all off');
}

export function contactsLabel(g: Group | undefined, t: Translate = EN): string {
  if (!g) return '–';
  if (!g.total) return t('no sensors');
  return g.active.length ? t('{n} open', { n: g.active.length }) : t('all closed');
}

/** "now", "4 min ago", "2 h ago", "3 d ago". */
export function ago(iso: string | undefined, now: number, t: Translate = EN): string {
  const at = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(at)) return '';
  const m = Math.round((now - at) / 60_000);
  if (m < 1) return t('now');
  if (m < 60) return t('{n} min ago', { n: m });
  const h = Math.round(m / 60);
  if (h < 48) return t('{n} h ago', { n: h });
  return t('{n} d ago', { n: Math.round(h / 24) });
}

/** Where the refresh is: 0..1 of the way to the next one, and seconds left. */
export function countdown(lastAt: number, nextAt: number, now: number): { progress: number; left: number } {
  const span = Math.max(1, nextAt - lastAt);
  const progress = Math.min(1, Math.max(0, (now - lastAt) / span));
  return { progress, left: Math.max(0, Math.ceil((nextAt - now) / 1000)) };
}
