/**
 * The house's snapshot kept fresh on a page (both views: the overview and the e-ink board). It asks
 * /home/state again when the snapshot says so, retries a failure after 15 s, and refreshes when a phone
 * wakes the tab. `now` ticks every second for clocks and "5 min ago".
 */
import type { Snapshot } from './types';

const RETRY_MS = 15_000;

export class Live {
  snap = $state<Snapshot>() as Snapshot;
  now = $state(Date.now());
  lastAt = $state(0);
  nextAt = $state(0);
  loading = $state(false);
  failedAt = $state<number | null>(null);

  constructor(initial: Snapshot) {
    this.snap = initial;
    this.lastAt = Date.parse(initial.at);
    this.nextAt = this.lastAt + initial.refreshSeconds * 1000;
  }

  async refresh() {
    if (this.loading) return;
    this.loading = true;
    try {
      const res = await fetch('/home/state', { headers: { accept: 'application/json' } });
      if (!res.ok) throw new Error(String(res.status));
      this.snap = (await res.json()) as Snapshot;
      this.lastAt = Date.now();
      this.nextAt = this.lastAt + this.snap.refreshSeconds * 1000;
      this.failedAt = null;
    } catch {
      this.failedAt = Date.now();
      this.lastAt = Date.now();
      this.nextAt = this.lastAt + RETRY_MS;
    } finally {
      this.loading = false;
    }
  }

  /** Start ticking (call in onMount); `tick` runs every second too. Returns the cleanup. */
  start(tick?: (now: number) => void): () => void {
    const timer = setInterval(() => {
      this.now = Date.now();
      if (this.now >= this.nextAt) this.refresh();
      tick?.(this.now);
    }, 1000);
    const wake = () => {
      if (document.visibilityState === 'visible' && Date.now() - this.lastAt > 10_000) this.refresh();
    };
    document.addEventListener('visibilitychange', wake);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', wake);
    };
  }
}

/** Up to `max` of today's events: what is still ahead first, then the latest of what is over, in time order. */
export function shownEvents<E extends { allDay: boolean; start: string; end: string }>(events: E[], now: number, max = 6): E[] {
  const past = (e: E) => !e.allDay && Date.parse(e.end) <= now;
  const ahead = events.filter((e) => !past(e));
  const over = events.filter(past).slice(-Math.max(0, max - ahead.length));
  return events.filter((e) => ahead.slice(0, max).includes(e) || over.includes(e));
}
