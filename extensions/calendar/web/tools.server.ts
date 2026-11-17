/**
 * Tools for the AI (core spec 005): the shared calendar as `calendar__<tool>`. Reading covers every
 * extension's entries (training sessions, Garmin activities, subscribed calendars, ...); writing only the
 * calendar's own entries (ids "e<n>"): the others belong to their extensions and change there.
 */
import { dayIn, instantIn, nextDay, todayIn, ToolError, type ExtensionContext, type ExtTool } from '$shell';
import { addOwnCalendar, calendarForEntry, withFeeds } from './lib/cals.server';
import { HUES, isHue, nextHue } from './lib/calendars';
import { addEntry, removeEntry, updateEntry } from './lib/entries.server';
import { ownId, parseEntry, toEntry, type EntryInput } from './lib/entry';
import { feedStates } from './lib/feeds.server';
import { localWhen, plain } from './lib/view';

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const zone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

async function between(ctx: ExtensionContext, first: string, last: string, only?: string[]) {
  const tz = zone();
  const r = await ctx.calendar.entries({ from: instantIn(first, '00:00', tz), to: instantIn(nextDay(last), '00:00', tz), only });
  return { ...r, timeZone: tz };
}

const entryProps = {
  title: { type: 'string', maxLength: 200 },
  date: { type: 'string', description: 'YYYY-MM-DD, the (first) day' },
  end_date: { type: 'string', description: 'YYYY-MM-DD, the last day (inclusive) of an entry over several days; default date' },
  start_time: { type: 'string', description: 'HH:MM in the owner\'s time zone; leave out for an all-day entry' },
  end_time: { type: 'string', description: 'HH:MM; default an hour after start_time' },
  location: { type: 'string', maxLength: 200 },
  note: { type: 'string', maxLength: 1000 },
  calendar: { type: 'string', description: 'The calendar it goes into: its id or name from overview (one that keeps entries, not a subscription). Default: the first one' }
};

/** The calendar named in args, or the default one; a ToolError when the name is unknown. */
async function calendarOf(ctx: ExtensionContext, args: Record<string, unknown>, required: boolean) {
  const wanted = args.calendar == null || args.calendar === '' ? null : String(args.calendar);
  if (!wanted && !required) return null;
  const cal = await ctx.db((sql) => calendarForEntry(sql, wanted, ctx.t('Calendar'), 'claude'));
  if (!cal) throw new ToolError(`no calendar "${wanted}" that keeps entries (see overview)`);
  return cal;
}

function checked(args: Record<string, unknown>, ctx: ExtensionContext) {
  const r = parseEntry(args as EntryInput, zone(), ctx.t);
  if ('error' in r) throw new ToolError(r.error);
  return r.row;
}

export const tools: ExtTool[] = [
  {
    name: 'overview',
    title: 'Calendar',
    readOnly: true,
    description:
      'The shared calendar for the next `days` days (default 14, max 60) from today in the owner\'s time zone: every entry of every ' +
      'app that puts things on it (the calendar\'s own entries, subscribed calendars, training sessions, Garmin activities and planned ' +
      'workouts, Home Assistant calendars, ...), sorted, each with `when` in local time, `source` (the app) and `kind`; which apps ' +
      'contributed and how many entries each; and the subscribed calendars with their state. Ids starting with "e" are the ' +
      'calendar\'s own entries (they can be changed with update_entry / remove_entry).',
    input: { type: 'object', properties: { days: { type: 'integer', minimum: 1, maximum: 60 } } },
    run: async (args, ctx) => {
      const days = Math.min(60, Math.max(1, Number(args.days) || 14));
      const tz = zone();
      const today = todayIn(tz);
      let last = today;
      for (let i = 1; i < days; i++) last = nextDay(last);
      const [r, feeds] = await Promise.all([between(ctx, today, last), feedStates(ctx)]);
      const rows = await withFeeds(ctx, feeds);
      return {
        calendars: rows.map((c) => ({ id: String(c.id), name: c.name, color: c.hue, ...(c.feed_id ? { subscription: true } : {}) })),
        today,
        timeZone: tz,
        range: { from: today, to: last },
        entries: r.entries.map((e) => plain(e, tz)),
        sources: r.sources,
        subscriptions: feeds.map((f) => ({ name: f.name, ok: f.ok, events: f.cal?.events.length ?? 0, ...(f.error ? { error: f.error } : {}) }))
      };
    }
  },
  {
    name: 'entries',
    title: 'Calendar entries in a range',
    readOnly: true,
    description:
      'Entries of the shared calendar from `from` to `to` (YYYY-MM-DD, both inclusive, at most 366 days), optionally only from ' +
      'some apps (`sources`: extension ids such as "calendar", "training", "health", "home"). Same fields as in overview.',
    input: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'YYYY-MM-DD' },
        to: { type: 'string', description: 'YYYY-MM-DD, inclusive' },
        sources: { type: 'array', items: { type: 'string' }, maxItems: 20 }
      },
      required: ['from', 'to']
    },
    run: async (args, ctx) => {
      const from = String(args.from ?? '');
      const to = String(args.to ?? '');
      if (!DAY.test(from) || !DAY.test(to) || to < from) throw new ToolError('from and to are YYYY-MM-DD, with to on or after from');
      if (Date.parse(to) - Date.parse(from) > 365 * 86_400_000) throw new ToolError('at most 366 days at once');
      const only = Array.isArray(args.sources) && args.sources.length ? args.sources.map(String) : undefined;
      const r = await between(ctx, from, to, only);
      return { timeZone: r.timeZone, entries: r.entries.map((e) => plain(e, r.timeZone)), sources: r.sources };
    }
  },
  {
    name: 'add_entry',
    title: 'Add a calendar entry',
    readOnly: false,
    description:
      'Add an entry to the calendar (shared by everyone at home): a title and a date; with start_time (and end_time) it is ' +
      'timed, without it all day; end_date for one over several days. Times are in the owner\'s time zone. Returns the entry ' +
      'with its id. Things another app owns (a workout, an activity) are added in that app, not here.',
    input: { type: 'object', properties: entryProps, required: ['title', 'date'] },
    run: async (args, ctx) => {
      const row = checked(args, ctx);
      const cal = (await calendarOf(ctx, args, true))!;
      const r = await ctx.db((sql) => addEntry(sql, row, 'claude', cal));
      const e = toEntry(r, (d) => dayIn(d, zone()));
      return { saved: { ...e, when: localWhen({ allDay: row.all_day, start: e.start, end: e.end ?? e.start }, zone()) } };
    }
  },
  {
    name: 'update_entry',
    title: 'Change a calendar entry',
    readOnly: false,
    destructive: true,
    description:
      'Replace one of the calendar\'s own entries (id "e<n>" from overview or entries) with the fields given: send all of them, ' +
      'as for add_entry; what is left out is cleared.',
    input: { type: 'object', properties: { id: { type: 'string' }, ...entryProps }, required: ['id', 'title', 'date'] },
    run: async (args, ctx) => {
      const id = ownId(args.id);
      if (id === null) throw new ToolError('only the calendar\'s own entries (ids "e<n>") can be changed here');
      const row = checked(args, ctx);
      const cal = await calendarOf(ctx, args, false);
      const r = await ctx.db((sql) => updateEntry(sql, id, row, cal?.id ?? null));
      if (!r) throw new ToolError(`no entry ${String(args.id)}`);
      return { saved: toEntry(r, (d) => dayIn(d, zone())) };
    }
  },
  {
    name: 'remove_entry',
    title: 'Remove a calendar entry',
    readOnly: false,
    destructive: true,
    description: 'Remove one of the calendar\'s own entries (id "e<n>"). Entries of subscribed calendars and other apps cannot be removed here.',
    input: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    run: async (args, ctx) => {
      const id = ownId(args.id);
      if (id === null) throw new ToolError('only the calendar\'s own entries (ids "e<n>") can be removed here');
      if (!(await ctx.db((sql) => removeEntry(sql, id)))) throw new ToolError(`no entry ${String(args.id)}`);
      return { removed: String(args.id) };
    }
  },
  {
    name: 'add_calendar',
    title: 'Add a calendar',
    readOnly: false,
    description:
      'Add a calendar that keeps entries (e.g. "Family", "Work"), with a colour. Entries go into it with add_entry {calendar}. ' +
      'Subscriptions to Google, iCloud or Outlook calendars are added by the owner on the calendar page (the link is a secret).',
    input: {
      type: 'object',
      properties: { name: { type: 'string', minLength: 1, maxLength: 60 }, color: { type: 'string', enum: [...HUES] } },
      required: ['name']
    },
    run: async (args, ctx) => {
      const name = String(args.name ?? '').trim().slice(0, 60);
      if (!name) throw new ToolError('a name is needed');
      const cal = await ctx.db(async (sql) => {
        const taken = (await sql<{ hue: string }[]>`SELECT hue FROM calendar.calendars`).map((r) => r.hue);
        return addOwnCalendar(sql, name, isHue(args.color) ? args.color : nextHue(taken), 'claude');
      });
      return { saved: { id: String(cal.id), name: cal.name, color: cal.hue } };
    }
  }
];
