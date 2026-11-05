# CLAUDE.md (health extension)

Rules of the shell's `CLAUDE.md` and `specs/002-extensions.md` apply. In short:

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
| `health.sync_runs`, `health.sync_state` | sync history and cursor |
| `health.secret_garmin_tokens` | encrypted Garmin logins; only the `garmin-sync` service can read it |

Look at the raw JSON (`data`, `raw`) before assuming a field name. Logs: `/logs/garmin-sync.log`.

## garmin-sync

`services/garmin-sync/` (Python, garmy + curl_cffi: Garmin blocks plain HTTP clients by TLS fingerprint).
`garmin_core/` is the Garmin boundary and the token store, `sync/` the CLI, engine and Postgres writes;
put new logic in `sync/`. Each pass runs as a fresh process, so edits go live on the next tick
(`SYNC_INTERVAL_MINUTES`, 30). Tests: `cd services/garmin-sync && python3 -m pytest -q`.

- Login, once per profile: `docker compose exec -it garmin-sync python -m sync login [--profile <id>]`
  (email, password via getpass, MFA code). The password is never stored, only the encrypted token.
- `python -m sync backfill [--since 2020-01-01]`: full history, resumable.
- A rejected token or a rate limit aborts a pass; other failures are recorded per phase in
  `health.sync_runs.detail` and the pass continues.
