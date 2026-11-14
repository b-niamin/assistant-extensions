/**
 * Subscribed calendars: the links (System settings -> Calendar -> Subscriptions, a secret, as such a link
 * opens the calendar to anyone who has it), fetched when someone looks and kept 15 min in memory. When a
 * fetch fails the last good copy is served, so a calendar provider's bad minute does not empty the month.
 */
import { createHash } from 'node:crypto';
import { EN, type CalendarRange, type CalendarEntry, type ExtensionContext, type Translate } from '$shell';
import { feedUrls, occurrences, parseIcs, type IcsCalendar } from './ics';
import { publicUrl } from './net';

const FEED_TTL = 15 * 60_000;
const FEED_MAX_BYTES = 8_000_000;
// In two parts: `ext check`'s text scan would take a star-slash-star as the start of a comment.
const FEED_ACCEPT = 'text/calendar, text/plain, */' + '*';

/** A feed problem already worded for the owner (not wrapped again). */
class FeedError extends Error {}

interface Cached {
  at: number;
  cal: IcsCalendar;
  error?: string;
  errorAt?: number;
}
const cache = new Map<string, Cached>();
const inflight = new Map<string, Promise<IcsCalendar>>();

/** The links, in the order they were added. */
export const linksOf = async (ctx: ExtensionContext) => feedUrls(await ctx.secrets.get('links'));

/** A short stable id of a link, for entry ids (the link itself is a secret). */
export const feedId = (url: string) => createHash('sha256').update(url).digest('hex').slice(0, 10);

/** A feed's name: its own (X-WR-CALNAME), else the host. */
export const feedName = (url: string, cal: IcsCalendar | null) => cal?.name ?? new URL(url).host;

async function fetchFeed(url: string, timeoutMs: number, t: Translate): Promise<IcsCalendar> {
  const host = new URL(url).host;
  try {
    if (!publicUrl(url)) throw new FeedError(t('Calendar at {host} is not on the internet: only public calendar links work', { host }));
    const res = await fetch(url, { headers: { Accept: FEED_ACCEPT }, signal: AbortSignal.timeout(timeoutMs) });
    // A redirect must not lead into the stack either.
    if (res.url && !publicUrl(res.url)) throw new FeedError(t('Calendar at {host} is not on the internet: only public calendar links work', { host }));
    if (!res.ok) throw new FeedError(t('Calendar at {host} answered {status}', { host, status: res.status }));
    const text = await res.text();
    if (text.length > FEED_MAX_BYTES) throw new FeedError(t('Calendar at {host} is too large', { host }));
    if (!text.includes('BEGIN:VCALENDAR')) throw new FeedError(t('Calendar at {host} is not a calendar', { host }));
    return parseIcs(text);
  } catch (e) {
    if (e instanceof FeedError) throw e;
    if (e instanceof Error && e.name === 'TimeoutError') throw new Error(t('Calendar at {host} did not answer in time', { host }));
    throw new Error(t('Calendar at {host} failed: {error}', { host, error: e instanceof Error ? e.message : String(e) }));
  }
}

/** One feed: from the cache while fresh, else fetched (once, however many ask); stale on failure. */
export async function loadFeed(url: string, timeoutMs = 5000, t: Translate = EN): Promise<IcsCalendar> {
  const hit = cache.get(url);
  // A failure is not retried for a minute: the page, the tile and the board all ask at once.
  if (hit && Date.now() - hit.at < FEED_TTL) return hit.cal;
  if (hit?.errorAt && Date.now() - hit.errorAt < 60_000) {
    if (hit.at) return hit.cal;
    throw new Error(hit.error);
  }
  let p = inflight.get(url);
  if (!p) {
    p = fetchFeed(url, timeoutMs, t).finally(() => inflight.delete(url));
    inflight.set(url, p);
  }
  try {
    const cal = await p;
    cache.set(url, { at: Date.now(), cal });
    return cal;
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    if (hit?.at) {
      cache.set(url, { ...hit, error, errorAt: Date.now() });
      return hit.cal;
    }
    cache.set(url, { at: 0, cal: { name: null, events: [] }, error, errorAt: Date.now() });
    throw e;
  }
}

/** The last problem of a feed that is served from an older copy, if any. */
export const staleError = (url: string) => cache.get(url)?.error;

export interface FeedState {
  id: string;
  url: string;
  name: string;
  ok: boolean;
  error?: string;
  /** Served from an older copy because the last fetch failed. */
  stale?: boolean;
  cal: IcsCalendar | null;
}

/** Every subscribed feed with its state; never throws. */
export async function feedStates(ctx: ExtensionContext, timeoutMs = 5000): Promise<FeedState[]> {
  const urls = await linksOf(ctx);
  return Promise.all(
    urls.map(async (url): Promise<FeedState> => {
      try {
        const cal = await loadFeed(url, timeoutMs, ctx.t);
        const err = staleError(url);
        return { id: feedId(url), url, name: feedName(url, cal), ok: true, cal, ...(err ? { error: err, stale: true } : {}) };
      } catch (e) {
        return { id: feedId(url), url, name: new URL(url).host, ok: false, error: e instanceof Error ? e.message : String(e), cal: null };
      }
    })
  );
}

/** Entries of every subscribed feed in the range, each with the feed's name as its kind. */
export async function feedEntries(ctx: ExtensionContext, range: CalendarRange, timeoutMs = 5000): Promise<CalendarEntry[]> {
  const states = await feedStates(ctx, timeoutMs);
  return states.flatMap((f) =>
    f.cal ? occurrences(f.cal, range, 1500).map((e) => ({ ...e, id: `f:${f.id}:${e.id}`.slice(0, 200), kind: f.name.slice(0, 30) })) : []
  );
}
