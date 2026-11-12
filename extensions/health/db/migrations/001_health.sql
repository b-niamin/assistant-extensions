-- health/001: the health schema, filled by the garmin-sync service (services/garmin-sync).
CREATE SCHEMA IF NOT EXISTS health;

-- Garmin login tokens, Fernet-encrypted with TOKEN_ENCRYPTION_KEY. secret_* tables are reachable only by
-- the extension's service role (ext_health_svc), not by the web app or Claude (db/extension-role.sql).
CREATE TABLE IF NOT EXISTS health.secret_garmin_tokens (
  user_id     text PRIMARY KEY REFERENCES core.profiles(id) ON DELETE CASCADE,
  ciphertext  text NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- One row per (profile, metric, day). `data` is Garmin's raw payload; has_value answers
-- "does this day hold a real reading" (Garmin returns all-null objects for empty days).
CREATE TABLE IF NOT EXISTS health.synced_metric_days (
  profile_id text NOT NULL REFERENCES core.profiles(id) ON DELETE CASCADE,
  metric     text NOT NULL,
  day        date NOT NULL,
  data       jsonb,
  has_value  boolean,
  synced_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, metric, day)
);

CREATE TABLE IF NOT EXISTS health.synced_activities (
  profile_id        text NOT NULL REFERENCES core.profiles(id) ON DELETE CASCADE,
  activity_id       text NOT NULL,
  sport             text NOT NULL,
  name              text,
  start_time        timestamptz NOT NULL,
  start_time_local  text NOT NULL,
  distance_m        double precision,
  duration_s        double precision,
  moving_s          double precision,
  elevation_gain_m  double precision,
  avg_hr            integer,
  max_hr            integer,
  avg_power         integer,
  max_power         integer,
  norm_power        integer,
  calories          integer,
  training_load     double precision,
  has_gps           boolean NOT NULL DEFAULT false,
  garmin_workout_id text,
  raw               jsonb,
  synced_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, activity_id)
);
CREATE INDEX IF NOT EXISTS synced_activities_profile_start_idx
  ON health.synced_activities(profile_id, start_time_local DESC);
CREATE INDEX IF NOT EXISTS synced_activities_profile_sport_idx
  ON health.synced_activities(profile_id, sport);

-- GPS / HR / power / running-dynamics streams per activity. streams->>'v' is the schema version.
CREATE TABLE IF NOT EXISTS health.synced_activity_streams (
  profile_id  text NOT NULL REFERENCES core.profiles(id) ON DELETE CASCADE,
  activity_id text NOT NULL,
  streams     jsonb NOT NULL,
  efforts_v   integer,
  synced_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, activity_id)
);

CREATE TABLE IF NOT EXISTS health.synced_weight (
  profile_id text NOT NULL REFERENCES core.profiles(id) ON DELETE CASCADE,
  day        date NOT NULL,
  source     text NOT NULL,
  weight_kg  double precision NOT NULL,
  raw        jsonb,
  synced_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, day, source)
);

CREATE TABLE IF NOT EXISTS health.synced_planned_events (
  profile_id  text NOT NULL REFERENCES core.profiles(id) ON DELETE CASCADE,
  event_id    text NOT NULL,
  day         date NOT NULL,
  time_local  text,
  kind        text NOT NULL,
  title       text,
  sport       text,
  description text,
  duration_s  double precision,
  distance_m  double precision,
  target_load double precision,
  source      text NOT NULL DEFAULT 'garmin',
  synced_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, event_id)
);
CREATE INDEX IF NOT EXISTS synced_planned_events_profile_day_idx
  ON health.synced_planned_events(profile_id, day);

-- Subjective journal (RPE, soreness, mood). activity_id NULL = a note about the whole day.
CREATE TABLE IF NOT EXISTS health.journal_entries (
  id          text PRIMARY KEY,
  profile_id  text NOT NULL REFERENCES core.profiles(id) ON DELETE CASCADE,
  day         date NOT NULL,
  activity_id text,
  rpe         integer,
  soreness    integer,
  location    text,
  mood        integer,
  note        text,
  illness     boolean NOT NULL DEFAULT false,
  injury      boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS journal_entries_profile_day_activity_idx
  ON health.journal_entries(profile_id, day, activity_id) NULLS NOT DISTINCT;

-- Sync bookkeeping, written by services/garmin-sync.
CREATE TABLE IF NOT EXISTS health.sync_state (
  profile_id         text NOT NULL REFERENCES core.profiles(id) ON DELETE CASCADE,
  source             text NOT NULL,
  cursor             jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_full_sync_at  timestamptz,
  last_sync_at       timestamptz,
  PRIMARY KEY (profile_id, source)
);

CREATE TABLE IF NOT EXISTS health.sync_runs (
  id           text PRIMARY KEY,
  profile_id   text NOT NULL REFERENCES core.profiles(id) ON DELETE CASCADE,
  kind         text NOT NULL,              -- incremental | backfill
  status       text NOT NULL,              -- running | ok | partial | failed
  started_at   timestamptz NOT NULL DEFAULT now(),
  finished_at  timestamptz,
  error        text,
  detail       jsonb,
  progress     double precision,           -- 0..1 while running
  phase        text,                       -- a short label ("Fetching history: March 2024")
  since        date,
  -- Touched with every progress step: a 'running' row that stops beating was cut off (container restart).
  heartbeat_at timestamptz
);
CREATE INDEX IF NOT EXISTS sync_runs_profile_started_idx ON health.sync_runs(profile_id, started_at DESC);

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
