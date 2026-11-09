-- health/002: syncs asked for from System settings, live progress, and which accounts are connected.

-- "Sync now" and "fetch older data" from the settings panel. The web app inserts a row; garmin-sync
-- picks it up within seconds (started_at), runs it and fills finished_at.
CREATE TABLE IF NOT EXISTS health.sync_requests (
  id           text PRIMARY KEY,
  profile_id   text NOT NULL REFERENCES core.profiles(id) ON DELETE CASCADE,
  source       text NOT NULL DEFAULT 'garmin',
  kind         text NOT NULL,              -- incremental | backfill
  since        date,                       -- backfill: fetch data back to this day
  requested_at timestamptz NOT NULL DEFAULT now(),
  started_at   timestamptz,
  finished_at  timestamptz
);
CREATE INDEX IF NOT EXISTS sync_requests_pending_idx ON health.sync_requests(requested_at) WHERE started_at IS NULL;

-- Progress of a running pass: 0..1 and a short label ("Fetching history: March 2024").
ALTER TABLE health.sync_runs ADD COLUMN IF NOT EXISTS progress double precision;
ALTER TABLE health.sync_runs ADD COLUMN IF NOT EXISTS phase text;
ALTER TABLE health.sync_runs ADD COLUMN IF NOT EXISTS since date;
-- Touched with every progress step: a 'running' row that stops beating was cut off (container restart).
ALTER TABLE health.sync_runs ADD COLUMN IF NOT EXISTS heartbeat_at timestamptz;

-- Connected accounts, without the secret: the web app cannot read secret_garmin_tokens, so the service
-- mirrors which profiles have a login here (and when it stopped working).
CREATE TABLE IF NOT EXISTS health.connected_accounts (
  profile_id    text NOT NULL REFERENCES core.profiles(id) ON DELETE CASCADE,
  source        text NOT NULL,
  connected_at  timestamptz NOT NULL DEFAULT now(),
  status        text NOT NULL DEFAULT 'connected', -- connected | reconnect | disconnected
  checked_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, source)
);
