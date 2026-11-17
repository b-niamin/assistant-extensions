# AGENTS.md (health extension)

Rules of the shell's `AGENTS.md` and `specs/002-extensions.md` apply. In short:

- Import from the shell only `$shell` / `$shell/ui`. Queries only through `ctx.db(sql => ...)` (role
  `ext_health`: schema `health` + `core.profiles`), always filtered by `ctx.dataProfileId`.
- Value extraction from Garmin's raw JSON lives in `web/lib/metrics.ts`; look at the raw `data` / `raw`
  before assuming a field name.
- Migrations: new numbered file in `db/migrations/`, additive only.

## Data

Every table is keyed by `profile_id` (read with `psql "$CLAUDE_RO_DATABASE_URL"`, or the `health__*` tools):

| Table | What |
|---|---|
| `health.synced_metric_days` | one row per (metric, day); `data` = raw Garmin JSON, `has_value` = real reading. Metrics: sleep, hrv, body_battery, stress, resting_heart_rate, steps, spo2, respiration, calories, training_readiness |
| `health.synced_activities` | one row per activity: sport, start_time_local, distance_m, duration_s, avg_hr, training_load, raw |
| `health.synced_activity_streams` | per-activity GPS/HR/power/cadence arrays |
| `health.synced_weight` | weigh-ins in kg |
| `health.synced_planned_events` | Garmin calendar (planned workouts, races) |
| `health.journal_entries` | subjective notes: RPE, soreness, mood, illness, injury |
| `health.sync_runs`, `health.sync_state` | sync history (with live `progress` 0..1 and `phase` of a running pass) and cursor (`nextRunAt`, `metricsBackfilledTo`) |
| `health.sync_requests` | passes asked for in System settings ("Sync now", "Fetch older data"); garmin-sync picks them up within seconds |
| `health.connected_accounts` | which profiles have a Garmin login (`connected`, `reconnect`, `disconnected`), mirrored by garmin-sync without the secret |
| `health.secret_garmin_tokens` | encrypted Garmin logins; only the services can read it |
| `health.synced_strava_activities` | Strava activities (name, description, sport, start, raw), `garmin_activity_id` = the Garmin activity of the same workout (start within 2 min) |
| `health.synced_weight` (`source` = `withings`) | Withings weigh-ins, the day's latest; `raw` has fat %, muscle, water, bone |
| `health.outbox` | writes to the sources (`garmin`: send_workout, remove_workout, add_weight, edit_activity; `strava`: edit_activity), run in order by `connectors`; `state` queued/running/done/failed/unsupported |
| `health.pushed_workouts` | workouts this app put on the Garmin calendar, by the caller's `ref` (sending a ref again replaces it) |
| `health.connector_options` | per-profile switches (`withings_to_garmin` = `{on, since}`) |
| `health.oauth_pending`, `health.secret_oauth` | an OAuth sign-in in progress; the encrypted Strava/Withings logins (own API app + tokens, service only) |

Look at the raw JSON (`data`, `raw`) before assuming a field name. Logs: `/worker/logs/health.garmin-sync.log`, `/worker/logs/health.connectors.log`.

## On the shared calendar

`web/calendar.server.ts` (shell 5, core spec 002 "Calendar entries") puts every activity (`a:<id>`, start +
duration, links to its page) and every planned event (`p:<id>`, timed when `time_local` is set, else all
day) on the calendar extension's month, for the viewing profile. Read live, nothing copied.

## connectors (Strava, Withings, writes)

A second service from the same folder: `python -m sync connectors` (`sync/connectors.py`). Every 5 s it runs
the queued writes (`sync/outbox.py`, one at a time) and "Sync now" requests of strava/withings; every
`SYNC_INTERVAL_MINUTES` it syncs each connected profile (`sync/strava.py`, `sync/withings.py`). The web app
and the tools never talk to a source: they insert into `health.outbox` and the service answers in the row.
Garmin writes beyond workouts (weigh-in, activity name and description) are in `sync/garmin_writes.py`
(paths are ASSUMPTIONs, like garmin_core's workout paths).

- Sign-in, once per profile and source, in the app's terminal (the card's button runs it):
  `ext-run health connectors python -m sync connect strava|withings [--profile <id>] [--app https://<this app>]`.
  It asks for the owner's own API app (client ID, secret: never shown again), prints the provider's
  "Allow" link; the provider sends the browser to `/health/oauth`, which stores the code for that sign-in
  (`web/routes/oauth`), and the command trades it for tokens. Strava: callback domain = the app's host;
  Withings: callback URL = `https://<this app>/health/oauth`. `disconnect` forgets a login.
- Tools for writes: `edit_activity`, `send_workout` / `remove_workout` (Claude uses these to put another
  app's plan on the watch, with that app's ids as `ref`), `add_weight`, `copy_weights_to_garmin`, `configure`,
  `sync_now`; `writes` says how each ended. The calendar hides Garmin planned workouts that are in
  `pushed_workouts` (same day and title): the extension that sent them shows them already.

## garmin-sync

`services/garmin-sync/` (Python, garmy + curl_cffi: Garmin blocks plain HTTP clients by TLS fingerprint).
`garmin_core/` is the Garmin boundary and the token store, `sync/` the CLI, engine and Postgres writes;
put new logic in `sync/`. Each pass runs as a fresh process, so edits go live on the next tick
(`SYNC_INTERVAL_MINUTES`, 30). It runs in the assistant's worker (manifest `services`, spec 002
"Background work"), as the extension's own user with `DATABASE_URL` (role `ext_health_svc`) and
`TOKEN_ENCRYPTION_KEY`; the worker restarts it when its files change. Tests:
`cd services/garmin-sync && python3 -m pytest -q`.

- Login, once per profile, in the app's terminal: `ext-run health garmin-sync python -m sync login [--profile <id>]`
  (on the host: `docker compose exec -it worker ext-run ...`)
  (email, password via getpass, MFA code). The password is never stored, only the encrypted token.
- `python -m sync backfill [--since 2020-01-01]`: full history, resumable. The first one after a login is
  queued by itself (5 years back, stops after a year without data); older data is asked for in System
  settings -> Training & Health Data -> Connected accounts.
- The `loop` checks `health.sync_requests` every 5 s and runs the scheduled pass every
  `SYNC_INTERVAL_MINUTES`. Each pass reports `progress`/`phase` into its `sync_runs` row (the settings
  panel's progress bar). The panel itself is `web/sources.server.ts` (spec 002, "Connected accounts").
- Activity page: `/health/activity/<id>` (`web/routes/activity/[id]`): summary, route drawn from the GPS
  stream, heart rate / pace / elevation / power / cadence over time, laps, the journal note.
- A rejected token or a rate limit aborts a pass; other failures are recorded per phase in
  `health.sync_runs.detail` and the pass continues.
