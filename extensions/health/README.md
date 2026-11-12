# Training & Health

Assistant extension: Garmin data, i.e. sleep, HRV, Body Battery, readiness, activities.
Kind `native`, scope `profile`, schema `health`.

- `web/routes/` the page at `/health`; `web/lib/` metric extraction, stats, charts (with unit tests)
- `db/migrations/` the schema, including the encrypted Garmin tokens (`secret_garmin_tokens`)
- `services/garmin-sync/` the background sync (Python), run by the assistant's worker (manifest `services`)

## Install

```sh
node scripts/ext.mjs install health     # in the assistant checkout (or the app's terminal)
# garmin-sync starts in the worker within seconds (System settings -> Worker). Then, on the host, once:
docker compose exec -it worker ext-run health garmin-sync python -m sync login   # the password is never stored
```

`--profile <id>` picks the profile to connect (default: the first one). Every connected profile is
synced every 30 minutes (`SYNC_INTERVAL_MINUTES` in the service's `env` changes it). Needs an assistant
with the worker (since 2026-11-12); health 0.4 and older ran garmin-sync from their own `compose.yml`.

## Develop

```sh
cd services/garmin-sync && python3 -m pytest -q
```
