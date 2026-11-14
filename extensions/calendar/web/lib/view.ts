/** How entries read: local days and clock times in the owner's zone. Pure, shared by tools, tile and page. */
import { dayIn, type SharedEntry } from '$shell';

export const clock = (iso: string, timeZone: string) =>
  new Date(iso).toLocaleTimeString('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

/** The days an entry shows on, inclusive: ["2026-11-14"], or several for a long one (at most `max`). */
export function daysOf(e: Pick<SharedEntry, 'allDay' | 'start' | 'end'>, timeZone: string, max = 62): string[] {
  const first = e.allDay ? e.start : dayIn(new Date(e.start), timeZone);
  // A timed entry ending exactly at midnight does not show on the next day.
  const last = e.allDay
    ? new Date(Date.parse(`${e.end}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10)
    : dayIn(new Date(Math.max(Date.parse(e.start), Date.parse(e.end) - 1)), timeZone);
  const out: string[] = [];
  for (let d = first; d <= last && out.length < max; d = new Date(Date.parse(`${d}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10)) out.push(d);
  return out.length ? out : [first];
}

/** "2026-11-14 18:30–19:30", "2026-11-14", "2026-11-14 – 2026-11-16", "2026-11-14 22:00 – 2026-11-15 02:00". */
export function localWhen(e: Pick<SharedEntry, 'allDay' | 'start' | 'end'>, timeZone: string): string {
  const days = daysOf(e, timeZone, 400);
  if (e.allDay) return days.length > 1 ? `${days[0]} – ${days[days.length - 1]}` : days[0];
  const s = clock(e.start, timeZone);
  const end = clock(e.end, timeZone);
  if (days.length > 1) return `${days[0]} ${s} – ${days[days.length - 1]} ${end}`;
  return e.end === e.start ? `${days[0]} ${s}` : `${days[0]} ${s}–${end}`;
}

/** An entry for Claude: plain fields, local time next to the instants. */
export const plain = (e: SharedEntry, timeZone: string) => ({
  id: e.id,
  title: e.title,
  when: localWhen(e, timeZone),
  allDay: e.allDay,
  start: e.start,
  end: e.end,
  ...(e.kind ? { kind: e.kind } : {}),
  ...(e.location ? { location: e.location } : {}),
  ...(e.note ? { note: e.note } : {}),
  source: e.source.extension
});
