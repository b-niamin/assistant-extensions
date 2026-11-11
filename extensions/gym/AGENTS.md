# AGENTS.md (gym extension)

Rules of the shell's `AGENTS.md`, `specs/002-extensions.md` and `docs/extensions.md` apply. In short: a
onefile app wears the shell's tokens and Beni; Claude reaches its data only through its MCP tools.

## How it works

- Onefile, scope **profile**. `app.html` is the Gym Tracker from
  [onefile-apps](https://github.com/b-niamin/onefile-apps) (`apps/gym-tracker/muscle-map`), restyled by
  `sync-from-onefile.py`, which rebuilds the whole file. A change made only here is lost at the next
  sync: make it upstream too, or teach the script to apply it.
- All data is one localStorage key, `gym-notebook.v1` (JSON: plans, workouts with sets, settings),
  saved by the shell to `core.extension_kv`. Every key has a version: a save from a tab that loaded an
  older version is refused and the app reloads with the newer data (spec 002), so Claude's writes and
  the phone's are not overwritten.
- The dashboard tile is the `__tile` key the app writes (spec 003).

## Data for Claude

- `gym__overview`: plans, this week's and the last 30 days' counts, recent workouts with their sets.
- `gym__log_workout`: adds a finished workout (exercises, sets, weights) on a day.
- `gym__save_plan`: adds or replaces a plan.
Writes only add workouts or plans; the app shows them the next time it opens (or at once, after a
conflict reload). The shell's raw `read_data` / `write_data` exist for the terminal only.

## Change it

`node scripts/ext.mjs check gym` in the shell repo, then open `/gym`. Texts live inside `app.html` (EN and
PL); `i18n/pl.json` covers the manifest and the tools. Bump `version` in `extension.json`.
