# AGENTS.md (calendar extension)

Rules of the shell's `AGENTS.md` and `specs/002-extensions.md` apply. In short: import from the shell only
`$shell` / `$shell/ui`; the look is the shell's tokens and Beni (`specs/001-design.md`).

## How it works

- Native, scope **shared** (one calendar for the house), shell 5. It shows the **shared calendar** of the
  core (spec 002, "Calendar entries"): every extension may put entries on it through its own
  `web/calendar.server.ts` (`calendar: ExtCalendar`), and this one reads them all with
  `ctx.calendar.entries({ from, to })`. Nothing of the other extensions is copied here.
- Its own part (`web/calendar.server.ts`): the entries in `calendar.entries` (ids `e<n>`) and the
  subscribed calendars (ids `f:<link hash>:<uid>|<day>`, kind = the calendar's name).
- Table `calendar.entries`: `title`, `all_day`; timed entries have `start_at`/`end_at` (instants), all-day
  ones `start_day`/`end_day` (dates, **end exclusive**); `location`, `note`, `created_by` (a profile id or
  `claude`). A CHECK keeps exactly one of the two forms.
- Subscriptions: the secret `links` (`"multiple": true`, one link per line), edited in the "Subscribed
  calendars" card (`web/sources.server.ts`). `web/lib/feeds.server.ts` fetches a link when someone looks
  (public addresses only, `web/lib/net.ts`), keeps it 15 min in memory, serves the last good copy when a
  fetch fails, and retries a failing one after a minute. Nothing is stored: links can be read-only secrets.
- Pure logic, unit-tested: `ics.ts` (parse ICS, occurrences in a range: RRULE DAILY/WEEKLY/MONTHLY/YEARLY,
  INTERVAL, BYDAY, BYMONTHDAY, BYMONTH, COUNT, UNTIL, EXDATE, RECURRENCE-ID), `entry.ts` (checking input,
  row <-> entry), `month.ts` (the grid), `view.ts` (days and local times), `tile.ts`, `calendars.ts`.
- The **Calendars** card on the page (`web/lib/calendars.ts`, pure): one row per calendar with its colour
  and a switch. Keys: `calendar` (own entries), `calendar:<link hash>` (each subscription), `<extension id>`
  (every other contributor in `ctx.calendar` sources, so a newly installed app appears by itself).
  Switched-off keys are a JSON list in `ctx.kv` under `hidden:<profile id>` (the extension is shared, the
  choice is per profile), applied to the page and the tile, not to Claude's tools.
- Times are the owner's zone (the server's TZ = APP_TIMEZONE), via `instantIn` / `dayIn` from `$shell`.

## Data for Claude

- `calendar__overview`: the next `days` days (default 14) of the shared calendar, which apps contributed,
  and the subscriptions with their state.
- `calendar__entries`: a range (`from`, `to` inclusive, at most 366 days), optionally `sources`.
- `calendar__add_entry`, `calendar__update_entry`, `calendar__remove_entry`: only the calendar's own entries
  (`e<n>`). Entries of other apps change in those apps (e.g. `training__update_session`).

## Tests

`web/lib/*.test.ts` run with the core's vitest (`cd apps/web && npm test`).
