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
- Pure logic, unit-tested: `home.ts` (lights incl. lamp switches via `isLampSwitch` and group de-duplication
  in `lightsOf`, contacts, alerts, official warnings), `weather.ts`
  (Open-Meteo normalization, periods, summary, forecast warnings), `calendar.ts` (HA events as shared-calendar
  entries, today's entries as board events in the house's time zone), `board.ts` (Beni's mood and line, labels, countdown), `tile.ts`.
- Calendar (shell 5, core spec 002 "Calendar entries"): `web/calendar.server.ts` puts the Home Assistant
  calendars the board watches on the shared calendar; the board's "Today" reads the shared calendar back
  (`ctx.calendar.entries`), so it also shows the Calendar app's entries and subscriptions, workouts, ...
  ICS subscriptions live in the Calendar app (home 2.0.0 dropped its own `calendar_links`).
- Settings: the connection (`url`, secret `token`), edited in its "Connected accounts" card (`web/sources.server.ts`, `fields`), and `location`. What the board watches lives in
  `ctx.kv` `config` (`web/lib/config.ts`), changed only through the `home__configure` tool.
- Caches: the forecast in `ctx.kv` (`weather`, 15 min, served up to 6 h old when Open-Meteo fails) and
  geocoded places (`geo:<name>`); HA config (1 h) and HA calendar events per range (5 min) in memory.

## Data for Claude

- `home__overview`: the snapshot (lights on, doors and windows open with `since`, alerts, weather now and
  per hour for 24 h with warnings, today's events) and the current config.
- `home__entities`: Home Assistant entities (filter by `domain`, `search`) and whether the board watches each.
- `home__configure`: change what the board watches (lights, contacts, alerts, alert_minutes, weather_alerts,
  calendars, refresh_seconds; `reset` to start from the defaults). Validates and reports how many entities
  each pattern matches. Prefer it to telling the owner to edit anything.

`home__query` has nothing to read (no tables). The KV rows are `config`, the cached forecast and geocoded places.

## Tests

`web/lib/*.test.ts` run with the core's vitest (`cd apps/web && npm test`).
