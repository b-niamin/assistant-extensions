/**
 * "Connected accounts" in the calendar's System settings panel (core spec 002): the subscribed calendars.
 * Links (ICS or webcal) are typed right in the card (`fields`), one per row, and each feed shows its name
 * and what it has in the coming week.
 */
import { instantIn, nextDay, todayIn, type ExtensionContext, type ExtSources, type SourceStatus } from '$shell';
import { feedStates } from './lib/feeds.server';
import { occurrences } from './lib/ics';

async function subscriptionsCard(ctx: ExtensionContext): Promise<SourceStatus> {
  const t = ctx.t;
  const card: SourceStatus = { id: 'subscriptions', name: t('Subscribed calendars'), state: 'not_connected', fields: ['links'] };
  const feeds = await feedStates(ctx, 3000);
  if (!feeds.length) {
    return {
      ...card,
      help: t(
        'Paste a subscription link (ICS or webcal) and press +, once per calendar. Google: calendar settings -> "Secret address in iCal format". iCloud: share the calendar as a public calendar. Outlook: publish a calendar -> ICS.'
      )
    };
  }
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const today = todayIn(tz);
  let end = today;
  for (let i = 0; i < 7; i++) end = nextDay(end);
  const week = { from: instantIn(today, '00:00', tz), to: instantIn(end, '00:00', tz), timeZone: tz };
  const failed = feeds.filter((f) => !f.ok || f.stale);
  return {
    ...card,
    state: feeds.some((f) => f.ok) ? 'connected' : 'reconnect',
    account: t.n(feeds.length, '{n} calendar', '{n} calendars') + (failed.length ? t(', {n} not loading', { n: failed.length }) : ''),
    help: failed[0]?.error,
    facts: feeds.slice(0, 6).map((f) => {
      if (!f.cal) return { label: f.name, value: t('not loading') };
      const k = occurrences(f.cal, week).length;
      return { label: f.name, value: k ? t.n(k, '{n} event this week', '{n} events this week') : t('nothing this week') };
    }),
    actions: [{ id: 'check', label: t('Check calendars') }]
  };
}

export const sources: ExtSources = {
  async list(ctx) {
    return [await subscriptionsCard(ctx)];
  },

  async act(ctx, _source, action) {
    const t = ctx.t;
    if (action !== 'check' && action !== 'saved') throw new Error(t('Unknown action.'));
    const card = await subscriptionsCard(ctx);
    if (!card.facts?.length) return t('Saved. Add a calendar link to subscribe.');
    if (card.state !== 'connected') throw new Error(card.help ?? t('No calendar is loading.'));
    const list = card.facts.map((f) => `${f.label} (${f.value})`).join(', ');
    return t('Calendars: {list}.', { list }) + (card.help ? ` ${card.help}.` : '');
  }
};
