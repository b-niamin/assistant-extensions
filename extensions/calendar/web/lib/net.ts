/**
 * Where the calendar may fetch subscriptions from (audit report D10). It runs inside the assistant's `web`
 * container, which also reaches the database, the browser's DevTools port and the terminal: a calendar
 * link typed in settings must not turn into a request to those.
 */

/** Names of the assistant's own containers (docker-compose.yml). */
const STACK = new Set(['db', 'web', 'browser', 'terminal', 'worker', 'migrate', 'ext-migrate', 'backup', 'llm', 'localhost']);

function privateIp(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, '').toLowerCase();
  if (h === '::1' || h.startsWith('fc') || h.startsWith('fd') || h.startsWith('fe80')) return h.includes(':');
  const m = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(h);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
}

/** A calendar feed: on the internet only (no private addresses, no single-label names like `db`). */
export function publicUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
    const host = u.hostname.toLowerCase();
    return host.includes('.') && !STACK.has(host) && !privateIp(host) && !host.endsWith('.localhost') && !host.endsWith('.internal');
  } catch {
    return false;
  }
}
