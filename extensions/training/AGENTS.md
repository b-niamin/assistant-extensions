# AGENTS.md (training extension)

Rules of the shell's `AGENTS.md` and `specs/002-extensions.md` apply: import only `$shell` / `$shell/ui`,
queries only through `ctx.db` (role `ext_training`), always filtered by `ctx.dataProfileId`, migrations
additive. This extension never reads another app's tables or calls another app: Claude joins it with
Training & Health through both apps' tools.

## Data

| Table | What |
|---|---|
| `training.plans` | a goal over some days: name, goal, sport (NULL = mixed), start_day, end_day, status active/done/archived |
| `training.sessions` | one session on a day: sport (`SPORTS` in `web/lib/model.ts`), title, time_local, duration_min, distance_m, `steps` (endurance: the step tree `health__send_workout` takes), `exercises` (strength: `[{name, sets: [{reps, kg, seconds}], rest_s, note}]`), status planned/done/skipped, `result` (what was logged: exercises with done sets, rpe, note, started_at, finished_at), `activity_ref` (the real activity, e.g. a Garmin activity id), `sent_at` (on the watch), `source` |
| `training.templates` | reusable workouts |

## With other apps (through Claude)

- Watch: `training__garmin_workout {id}` gives the exact `health__send_workout` arguments (ref
  `training:<id>`), then `training__mark_sent {id, sent: true}`. A changed or moved session is sent again
  with the same ref (Garmin replaces it); `delete_sessions`, `move_sessions` and `update_session` say which
  were on the watch.
- Strava/Garmin titles: find the activity with `health__activities`, rename it with
  `health__edit_activity`, link it with `training__log_session {id, status: done, activity_ref}`.

Pure logic (checks, the Garmin workout, bests) is in `web/lib/model.ts` with tests;
`web/lib/view.ts` has the week and the tile.
