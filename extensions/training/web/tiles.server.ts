/** Dashboard tile of the training plan (spec 003): this week, planned against done, and what is next. */
import { todayIn, type ExtTile } from '$shell';
import { sessionsIn } from './lib/db.server';
import { weekTile } from './lib/view';
import { addDays, mondayOf } from './lib/model';

export const tiles: ExtTile[] = [
  {
    id: 'week',
    title: 'Training this week',
    size: 'md',
    load: (ctx) =>
      ctx.db(async (sql) => {
        const today = todayIn();
        const monday = mondayOf(today);
        const list = await sessionsIn(sql, ctx.dataProfileId!, monday, addDays(monday, 13));
        return weekTile(list, today, ctx.t);
      })
  }
];
