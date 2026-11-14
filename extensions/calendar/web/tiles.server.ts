/** Dashboard tile (core spec 003): what is on today and coming up, from every app on the calendar. */
import { instantIn, nextDay, todayIn, type ExtTile } from '$shell';
import { upcomingTile } from './lib/tile';

export const tiles: ExtTile[] = [
  {
    id: 'upcoming',
    title: 'Calendar',
    size: 'md',
    load: async (ctx) => {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
      const today = todayIn(tz);
      let end = today;
      for (let i = 0; i < 7; i++) end = nextDay(end);
      const now = new Date();
      const { entries } = await ctx.calendar.entries({ from: instantIn(today, '00:00', tz), to: instantIn(end, '00:00', tz) });
      return upcomingTile(entries, today, tz, now, ctx.t);
    }
  }
];
