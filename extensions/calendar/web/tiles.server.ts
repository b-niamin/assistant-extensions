/** Dashboard tile (core spec 003): what is on today and coming up, from every calendar the profile has on. */
import { instantIn, nextDay, todayIn, type ExtTile } from '$shell';
import { calendarKey, hiddenKey, parseHidden } from './lib/calendars';
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
      const [{ entries }, hidden] = await Promise.all([
        ctx.calendar.entries({ from: instantIn(today, '00:00', tz), to: instantIn(end, '00:00', tz) }),
        ctx.kv.get(hiddenKey(ctx.profileId)).then(parseHidden)
      ]);
      // The calendars switched off on the page stay off here too.
      return upcomingTile(entries.filter((e) => !hidden.includes(calendarKey(e))), today, tz, now, ctx.t);
    }
  }
];
