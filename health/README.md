# Training & Health

Assistant extension: Garmin data, i.e. sleep, HRV, Body Battery, readiness, activities.
Kind `native`, scope `profile`, schema `health`.

- `web/routes/` the page at `/health`; `web/lib/` metric extraction, stats, charts (with unit tests)
- `db/migrations/` the schema, including the encrypted Garmin tokens (`secret_garmin_tokens`)
- `services/garmin-sync/` the background sync (Python), started from `compose.yml`

## Install

```sh
node scripts/ext.mjs install health     # in the assistant checkout (or the claude container)
./install.sh                            # on the host: starts garmin-sync (adds compose.yml to COMPOSE_FILE)
docker compose exec -it garmin-sync python -m sync login   # Garmin login; the password is never stored
```

`--profile <id>` picks the profile to connect (default: the first one). Every connected profile is
synced every `SYNC_INTERVAL_MINUTES` (30).

## Develop

```sh
cd services/garmin-sync && python3 -m pytest -q
```
