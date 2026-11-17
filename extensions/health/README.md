# Training & Health Data

Assistant extension: Garmin, Strava and Withings in one place. Sleep, HRV, Body Battery, readiness,
activities and weight, and writes back to them: workouts to the Garmin watch, titles and descriptions of
Strava and Garmin activities, Withings weigh-ins to Garmin.
Kind `native`, scope `profile`, schema `health`.

- `web/routes/` the page at `/health`; `web/lib/` metric extraction, stats, charts (with unit tests)
- `db/migrations/` the schema, including the encrypted Garmin tokens (`secret_garmin_tokens`)
- `services/garmin-sync/` the background services (Python), run by the assistant's worker (manifest `services`):
  `garmin-sync` (Garmin reads) and `connectors` (Strava, Withings, the queued writes)

## Install

```sh
node scripts/ext.mjs install health     # in the assistant checkout (or the app's terminal)
# garmin-sync starts in the worker within seconds (System settings -> Worker). Then, in the app's terminal, once
# (or the button in System settings -> Training & Health Data, which runs it there):
ext-run health garmin-sync python -m sync login   # the password is never stored
```

Strava and Withings (optional) use your own free API app of each (strava.com/settings/api,
developer.withings.com). The button on their card in System settings runs the sign-in in the terminal:

```sh
ext-run health connectors python -m sync connect strava     # or withings
```

It asks for the app's client ID and secret and gives you the link to allow access. Set the app's callback
to this app (Strava: its host as the callback domain; Withings: `https://<this app>/health/oauth`).

`--profile <id>` picks the profile to connect (default: the first one). Every connected profile is
synced every 30 minutes (`SYNC_INTERVAL_MINUTES` in the service's `env` changes it). Needs an assistant
with the worker (since 2026-11-12); health 0.4 and older ran garmin-sync from their own `compose.yml`.

## Develop

```sh
cd services/garmin-sync && python3 -m pytest -q
```
