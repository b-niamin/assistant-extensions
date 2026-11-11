/** What the board says, pure: Beni's mood and line, short labels, "x min ago". */
import type { Mood } from '$shell/ui';
import type { Group } from './home';
import type { Snapshot } from './types';

/** Beni keeps watch: alert -> on its toes, something open or on at night -> tired, all quiet -> by the hour. */
export function beni(s: Snapshot, hour: number): { mood: Mood; line: string } {
  const home = s.ha.home;
  if (!s.ha.configured && !s.weather.configured) return { mood: 'idle', line: 'Connect Home Assistant and I will keep an eye on the house.' };
  if (s.ha.error) return { mood: 'tired', line: 'I cannot reach Home Assistant right now.' };
  if (home?.alerts.some((a) => a.active)) return { mood: 'charged', line: 'Something is happening. Take a look.' };
  const open = home?.contacts.active.length ?? 0;
  const on = home?.lights.active.length ?? 0;
  const night = hour >= 23 || hour < 6;
  if (open) return { mood: night ? 'tired' : 'steady', line: open === 1 ? `${home!.contacts.active[0].name} is open.` : `${open} doors or windows are open.` };
  if (on && night) return { mood: 'tired', line: on === 1 ? `${home!.lights.active[0].name} is still on.` : `${on} lights are still on.` };
  if (night) return { mood: 'asleep', line: 'All quiet. Lights off, everything closed.' };
  return { mood: hour < 12 ? 'charged' : 'steady', line: home ? 'All quiet at home.' : 'Here is the weather.' };
}

export function lightsLabel(g: Group | undefined): string {
  if (!g) return '–';
  if (!g.total) return 'no lights';
  return g.active.length ? `${g.active.length} on` : 'all off';
}

export function contactsLabel(g: Group | undefined): string {
  if (!g) return '–';
  if (!g.total) return 'no sensors';
  return g.active.length ? `${g.active.length} open` : 'all closed';
}

/** "now", "4 min ago", "2 h ago", "3 d ago". */
export function ago(iso: string | undefined, now: number): string {
  const t = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(t)) return '';
  const m = Math.round((now - t) / 60_000);
  if (m < 1) return 'now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}

/** Where the refresh is: 0..1 of the way to the next one, and seconds left. */
export function countdown(lastAt: number, nextAt: number, now: number): { progress: number; left: number } {
  const span = Math.max(1, nextAt - lastAt);
  const progress = Math.min(1, Math.max(0, (now - lastAt) / span));
  return { progress, left: Math.max(0, Math.ceil((nextAt - now) / 1000)) };
}
