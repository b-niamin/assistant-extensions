# AGENTS.md (home extension)

Rules of the shell's `AGENTS.md` and `specs/002-extensions.md` apply. In short: import from the shell only
`$shell` / `$shell/ui`; the look is the shell's tokens and Beni (`specs/001-design.md`).

## How it works

- Native, scope **shared** (one house for every profile). No tables of its own: everything is read live.
- `web/lib/snapshot.server.ts` builds one `Snapshot` (`web/lib/types.ts`) for the page, the
  `/home/state` endpoint (the board's auto-refresh), the dashboard tile and Claude's `home__overview` tool.
  Each part fails on its own: Home Assistant down still shows the weather.
- Home Assistant (`web/lib/ha.server.ts`): read-only REST, `GET /api/config`, `/api/states`,
  `/api/calendars[/<entity>]`, with the token from `ctx.secrets.get('token')`. It never calls a service.
- Pure logic, unit-tested: `home.ts` (lights, contacts, alerts, official warnings), `weather.ts`
  (Open-Meteo normalization, periods, summary, forecast warnings), `calendar.ts` (today in the house's
  time zone), `board.ts` (Beni's mood and line, labels, countdown), `tile.ts`.
- Caches: the forecast in `ctx.kv` (`weather`, 15 min, served up to 6 h old when Open-Meteo fails) and
  geocoded places (`geo:<name>`); HA config (1 h) and today's events (5 min) in memory.

## Data for Claude

`home__overview` returns the snapshot: lights on, doors and windows open (with `since`), alerts, weather
now and per hour for 24 h with warnings, today's events. `home__query` has nothing to read (no tables);
the KV rows are the cached forecast.

## Tests

`web/lib/*.test.ts` run with the core's vitest (`cd apps/web && npm test`).
