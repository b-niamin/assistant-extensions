# AGENTS.md (training extension)

Rules of the shell's `AGENTS.md` and `specs/002-extensions.md` apply: import only `$shell` / `$shell/ui`,
queries only through `ctx.db` (role `ext_training`), always filtered by `ctx.dataProfileId`, migrations
additive. This extension never reads another app's tables or calls another app: Claude joins it with
Training & Health through both apps' tools.

## Data

| Table | What |
|---|---|
| `training.plans` | a goal over some days: name, goal, sport (NULL = mixed), start_day, end_day, status active/done/archived, `active` (at most one per profile, a partial unique index) |
| `training.sessions` | one workout on a day: title, time_local, duration_min, `items` (the workout: cardio and exercise items, see `Item` in `web/lib/model.ts`), `sport` (the main sport, derived), status planned/done/skipped, `result` (rpe, note, started_at, finished_at; ticked sets live in the items), `activity_ref`, `sent_at` (on the watch), `source`. Rows from before 1.1 have `steps`/`exercises` instead of `items`; `itemsOf` reads both |
| `training.templates` | reusable workouts (`items`) |
| `training.library` | the profile's own library entries; the built-in ones are in `web/lib/library.ts` |

Visible = of the active plan or of no plan (`sessionsIn(..., { visible: true })`): the week, the
calendar and the tile. Tools and the plan page see everything.

## With other apps (through Claude)

- Watch: `training__garmin_workout {id}` gives the exact `health__send_workout` arguments (ref
  `training:<id>`), then `training__mark_sent {id, sent: true}`. A changed or moved session is sent again
  with the same ref (Garmin replaces it); `delete_sessions`, `move_sessions` and `update_session` say which
  were on the watch.
- Strava/Garmin titles: find the activity with `health__activities`, rename it with
  `health__edit_activity`, link it with `training__log_session {id, status: done, activity_ref}`.

Pure logic (items, checks, the Garmin workout, bests) is in `web/lib/model.ts`, the library in
`web/lib/library.ts`, the gym side (last time, records, quick fills, muscles, recovery, plates, photos in
`web/lib/img/<id>_0|1.webp`) in `web/lib/gym.ts`, all with tests. The look is `web/lib/gym.css` (every
rule under `.gym`, loaded by `web/routes/+layout.svelte`), the parts in `web/lib/ui/`. The workout page
saves through the `autosave` action a moment after each change;
`web/lib/view.ts` has the week and the tile.
