/**
 * Calendar subscriptions (iCalendar / ICS links from Google, iCloud, Outlook, ...), read-only: parse a feed
 * and list its occurrences in a range, in the owner's time zone.
 * Handles all-day and timed events, TZID / UTC / floating times, and the usual recurrences (RRULE with
 * DAILY/WEEKLY/MONTHLY/YEARLY, INTERVAL, BYDAY, BYMONTHDAY, BYMONTH, COUNT, UNTIL), EXDATE and moved
 * occurrences (RECURRENCE-ID). Pure: the fetch lives in feeds.server.ts.
 */
import { dayIn, offsetIn, type CalendarEntry, type CalendarRange } from '$shell';

interface Prop {
  value: string;
  params: Record<string, string>;
}

/** A point in time as written: a day, or a day and time in a zone (null zone = floating, house time). */
interface IcsTime {
  y: number;
  m: number;
  d: number;
  /** Seconds since midnight; null for an all-day (VALUE=DATE) value. */
  secs: number | null;
  /** "UTC", a TZID, or null for floating. */
  tz: string | null;
}

export interface IcsEvent {
  uid: string;
  title: string;
  location?: string;
  start: IcsTime;
  /** Duration in seconds (from DTEND or DURATION). */
  duration: number;
  rrule?: Record<string, string>;
  exdates: string[];
  /** RECURRENCE-ID of a moved occurrence, as a key (see key()). */
  recurrenceId?: string;
  cancelled: boolean;
}

export interface IcsCalendar {
  name: string | null;
  events: IcsEvent[];
}

/** Unfold lines (RFC 5545: a line starting with a space continues the previous one). */
function lines(text: string): string[] {
  return text.replace(/\r\n?/g, '\n').replace(/\n[ \t]/g, '').split('\n');
}

function parseLine(line: string): [string, Prop] | null {
  // NAME;PARAM=a;PARAM="b:c":value
  let i = 0;
  let inQuote = false;
  for (; i < line.length; i++) {
    const c = line[i];
    if (c === '"') inQuote = !inQuote;
    else if (c === ':' && !inQuote) break;
  }
  if (i >= line.length) return null;
  const head = line.slice(0, i).split(';');
  const params: Record<string, string> = {};
  for (const p of head.slice(1)) {
    const eq = p.indexOf('=');
    if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, '');
  }
  return [head[0].toUpperCase(), { value: line.slice(i + 1), params }];
}

const unescape = (v: string) => v.replace(/\\n/gi, ' ').replace(/\\([,;\\])/g, '$1').trim();

function parseTime(p: Prop): IcsTime | null {
  const m = p.value.trim().match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
  if (!m) return null;
  const date = { y: +m[1], m: +m[2], d: +m[3] };
  if (!m[4] || p.params.VALUE === 'DATE') return { ...date, secs: null, tz: null };
  return { ...date, secs: +m[4] * 3600 + +m[5] * 60 + +(m[6] ?? 0), tz: m[7] ? 'UTC' : (p.params.TZID ?? null) };
}

function parseDuration(v: string): number {
  const m = v.match(/^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
  if (!m) return 0;
  const s = (+(m[2] ?? 0) * 7 + +(m[3] ?? 0)) * 86400 + +(m[4] ?? 0) * 3600 + +(m[5] ?? 0) * 60 + +(m[6] ?? 0);
  return m[1] === '-' ? -s : s;
}

const validZone = (tz: string | null) => {
  if (!tz || tz === 'UTC') return true;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

/** Epoch ms of an ICS time; floating and unknown zones are read in `houseTz`. */
export function toEpoch(t: IcsTime, houseTz: string): number {
  const naive = Date.UTC(t.y, t.m - 1, t.d) + (t.secs ?? 0) * 1000;
  if (t.tz === 'UTC') return naive;
  const tz = t.tz && validZone(t.tz) ? t.tz : houseTz;
  const first = naive - offsetIn(new Date(naive), tz) * 60_000;
  return naive - offsetIn(new Date(first), tz) * 60_000;
}

/** "2026-11-11" for an ICS time's own date. */
const dayKey = (t: { y: number; m: number; d: number }) =>
  `${t.y}-${String(t.m).padStart(2, '0')}-${String(t.d).padStart(2, '0')}`;

export function parseIcs(text: string): IcsCalendar {
  let name: string | null = null;
  const events: IcsEvent[] = [];
  let cur: Record<string, Prop[]> | null = null;
  let depth = 0;
  for (const raw of lines(text)) {
    if (!raw.trim()) continue;
    const pl = parseLine(raw);
    if (!pl) continue;
    const [key, prop] = pl;
    if (key === 'BEGIN') {
      if (prop.value.toUpperCase() === 'VEVENT' && !cur) {
        cur = {};
        depth = 0;
      } else if (cur) depth++;
      continue;
    }
    if (key === 'END') {
      if (cur && depth > 0) depth--;
      else if (cur && prop.value.toUpperCase() === 'VEVENT') {
        const ev = toEvent(cur);
        if (ev) events.push(ev);
        cur = null;
      }
      continue;
    }
    if (cur) {
      if (depth === 0) (cur[key] ??= []).push(prop);
    } else if (key === 'X-WR-CALNAME') name = unescape(prop.value) || null;
  }
  return { name, events };
}

function toEvent(p: Record<string, Prop[]>): IcsEvent | null {
  const one = (k: string) => p[k]?.[0];
  const startProp = one('DTSTART');
  const start = startProp && parseTime(startProp);
  if (!start) return null;
  let duration = start.secs === null ? 86400 : 0;
  const endProp = one('DTEND');
  const end = endProp && parseTime(endProp);
  // Floating times on both ends read in the same zone, so 'UTC' here gives the right length.
  if (end) duration = Math.max(0, (toEpoch(end, 'UTC') - toEpoch(start, 'UTC')) / 1000); else if (one('DURATION')) duration = Math.max(0, parseDuration(one('DURATION')!.value));
  let rrule: Record<string, string> | undefined;
  if (one('RRULE')) {
    rrule = {};
    for (const part of one('RRULE')!.value.split(';')) {
      const [k, v] = part.split('=');
      if (k && v) rrule[k.toUpperCase()] = v.toUpperCase();
    }
  }
  const exdates = (p.EXDATE ?? []).flatMap((x) =>
    x.value.split(',').map((v) => parseTime({ value: v, params: x.params })).filter((t): t is IcsTime => !!t).map(key)
  );
  const rid = one('RECURRENCE-ID') && parseTime(one('RECURRENCE-ID')!);
  return {
    uid: one('UID')?.value.trim() ?? '',
    title: unescape(one('SUMMARY')?.value ?? '') || '(no title)',
    location: one('LOCATION') ? unescape(one('LOCATION')!.value) || undefined : undefined,
    start,
    duration,
    rrule,
    exdates,
    recurrenceId: rid ? key(rid) : undefined,
    cancelled: (one('STATUS')?.value ?? '').trim().toUpperCase() === 'CANCELLED'
  };
}

/** Identifies one occurrence by its original start date (time ignored: enough within a day). */
function key(t: IcsTime): string {
  return dayKey(t);
}

const DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const dayNum = (y: number, m: number, d: number) => Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
const fromDayNum = (n: number) => {
  const dt = new Date(n * 86_400_000);
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
};
const weekday = (n: number) => (((n + 4) % 7) + 7) % 7; // 1970-01-01 was a Thursday
const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** Does a BYDAY entry ("TU", "2TU", "-1FR") hit this day, for a monthly rule? */
function byDayHitsMonthly(entry: string, y: number, m: number, d: number): boolean {
  const mm = entry.match(/^([+-]?\d{1,2})?(SU|MO|TU|WE|TH|FR|SA)$/);
  if (!mm) return false;
  if (DAYS[weekday(dayNum(y, m, d))] !== mm[2]) return false;
  if (!mm[1]) return true;
  const nth = +mm[1];
  return nth > 0 ? Math.ceil(d / 7) === nth : Math.ceil((daysInMonth(y, m) - d + 1) / 7) === -nth;
}

/** Is `day` (a day number in the event's own zone) an occurrence of the rule, ignoring COUNT/UNTIL? */
function matchesRule(ev: IcsEvent, rule: Record<string, string>, day: number): boolean {
  const s = ev.start;
  const startDay = dayNum(s.y, s.m, s.d);
  if (day < startDay) return false;
  const interval = Math.max(1, Number(rule.INTERVAL) || 1);
  const { y, m, d } = fromDayNum(day);
  const byDay = rule.BYDAY ? rule.BYDAY.split(',') : [];
  const byMonthDay = rule.BYMONTHDAY ? rule.BYMONTHDAY.split(',').map(Number) : [];
  const byMonth = rule.BYMONTH ? rule.BYMONTH.split(',').map(Number) : [];
  if (byMonth.length && !byMonth.includes(m)) return false;
  switch (rule.FREQ) {
    case 'DAILY':
      if (byDay.length && !byDay.some((b) => b.slice(-2) === DAYS[weekday(day)])) return false;
      return (day - startDay) % interval === 0;
    case 'WEEKLY': {
      const wkst = DAYS.indexOf(rule.WKST ?? 'MO');
      const weekStart = (n: number) => n - ((weekday(n) - wkst + 7) % 7);
      if (((weekStart(day) - weekStart(startDay)) / 7) % interval !== 0) return false;
      const days = byDay.length ? byDay.map((b) => b.slice(-2)) : [DAYS[weekday(startDay)]];
      return days.includes(DAYS[weekday(day)]);
    }
    case 'MONTHLY': {
      if (((y - s.y) * 12 + (m - s.m)) % interval !== 0) return false;
      if (byDay.length) return byDay.some((b) => byDayHitsMonthly(b, y, m, d));
      const mdays = byMonthDay.length ? byMonthDay : [s.d];
      return mdays.some((md) => (md > 0 ? md === d : daysInMonth(y, m) + md + 1 === d));
    }
    case 'YEARLY': {
      if ((y - s.y) % interval !== 0) return false;
      if (byDay.length && byMonth.length) return byDay.some((b) => byDayHitsMonthly(b, y, m, d));
      const months = byMonth.length ? byMonth : [s.m];
      const mdays = byMonthDay.length ? byMonthDay : [s.d];
      return months.includes(m) && mdays.includes(d);
    }
    default:
      return false;
  }
}

/** Occurrences of one feed that overlap the range, as calendar entries (ids: uid and the occurrence's day). */
export function occurrences(cal: IcsCalendar, range: CalendarRange, max = 2000): CalendarEntry[] {
  const tz = range.timeZone;
  const from = range.from.getTime();
  const to = range.to.getTime();
  const [fy, fm, fd] = dayIn(range.from, tz).split('-').map(Number);
  const [ly, lm, ld] = dayIn(new Date(to - 1), tz).split('-').map(Number);
  const firstNum = dayNum(fy, fm, fd);
  const lastNum = dayNum(ly, lm, ld);

  const moved = new Set(cal.events.filter((e) => e.recurrenceId).map((e) => `${e.uid}|${e.recurrenceId}`));
  const out: CalendarEntry[] = [];

  const push = (ev: IcsEvent, occ: { y: number; m: number; d: number }) => {
    const base = {
      id: `${ev.uid || ev.title}|${dayKey(occ)}`.slice(0, 200),
      title: ev.title,
      ...(ev.location ? { location: ev.location } : {})
    };
    if (ev.start.secs === null) {
      const first = dayNum(occ.y, occ.m, occ.d);
      const days = Math.max(1, Math.round(ev.duration / 86400));
      if (first > lastNum || first + days <= firstNum) return;
      out.push({ ...base, start: dayKey(occ), end: dayKey(fromDayNum(first + days)) });
      return;
    }
    const start = toEpoch({ ...occ, secs: ev.start.secs, tz: ev.start.tz }, tz);
    const end = start + ev.duration * 1000;
    if (!(start < to && (end > from || (ev.duration === 0 && start >= from)))) return;
    out.push({ ...base, start: new Date(start).toISOString(), end: new Date(end).toISOString() });
  };

  for (const ev of cal.events) {
    if (out.length >= max) break;
    if (ev.cancelled) continue;
    if (!ev.rrule || ev.recurrenceId) {
      push(ev, ev.start);
      continue;
    }
    const rule = ev.rrule;
    const startNum = dayNum(ev.start.y, ev.start.m, ev.start.d);
    // An occurrence that overlaps the range starts in it or, if long, a few days before (any zone).
    const span = Math.ceil(ev.duration / 86400) + 1;
    const lo = Math.max(startNum, firstNum - span);
    const hi = lastNum + 1;
    const until = rule.UNTIL ? parseTime({ value: rule.UNTIL, params: {} }) : null;
    const untilMs = until ? toEpoch(until.secs === null ? { ...until, secs: 86399 } : until, tz) : Infinity;
    const count = rule.COUNT ? Number(rule.COUNT) : Infinity;
    // With COUNT, occurrences are numbered from the first one; bounded at ~30 years.
    let n = 0;
    for (let x = Number.isFinite(count) ? startNum : lo; x <= hi && x - startNum < 11000; x++) {
      if (!matchesRule(ev, rule, x)) continue;
      if (++n > count) break;
      if (x < lo) continue;
      const occ = fromDayNum(x);
      if (toEpoch({ ...occ, secs: ev.start.secs ?? 0, tz: ev.start.tz }, tz) > untilMs) break;
      const k = dayKey(occ);
      if (ev.exdates.includes(k) || moved.has(`${ev.uid}|${k}`)) continue;
      push(ev, occ);
      if (out.length >= max) break;
    }
  }
  // The same event listed twice (feeds do that) shows once.
  const seen = new Set<string>();
  return out.filter((e) => {
    const k = `${e.title}|${e.start}`;
    if (seen.has(k) || seen.has(`id:${e.id}`)) return false;
    seen.add(k);
    seen.add(`id:${e.id}`);
    return true;
  });
}

/** "webcal://..." -> "https://..."; only http(s) after that, else null. */
export function feedUrl(v: string): string | null {
  const s = v.trim().replace(/^webcals?:\/\//i, 'https://');
  try {
    const u = new URL(s);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null;
  } catch {
    return null;
  }
}

/** The subscription field: links separated by spaces, commas or new lines. */
export const feedUrls = (v: unknown): string[] =>
  typeof v === 'string' ? [...new Set(v.split(/[\s,;]+/).map(feedUrl).filter((u): u is string => !!u))] : [];
