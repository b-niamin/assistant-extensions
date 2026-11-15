-- health/002: more sources than Garmin (Strava, Withings) and writes back to them.
-- The web app never talks to a source itself: it queues a row in health.outbox and the `connectors`
-- service (services/garmin-sync, `python -m sync connectors`) runs it within seconds.

-- OAuth logins of the API sources: the app's own client id/secret (typed in the terminal) and the
-- tokens, Fernet-encrypted with TOKEN_ENCRYPTION_KEY like the Garmin tokens. Service role only.
CREATE TABLE IF NOT EXISTS health.secret_oauth (
  profile_id  text NOT NULL REFERENCES core.profiles(id) ON DELETE CASCADE,
  provider    text NOT NULL,              -- strava | withings
  ciphertext  text NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, provider)
);

-- An OAuth sign-in in progress: `python -m sync connect <provider>` adds the row with a random state,
-- the provider sends the browser back to /health/oauth, which stores the code here; the command (or the
-- connectors service) trades it for tokens. A code alone is useless without the client secret.
CREATE TABLE IF NOT EXISTS health.oauth_pending (
  state         text PRIMARY KEY,
  profile_id    text NOT NULL REFERENCES core.profiles(id) ON DELETE CASCADE,
  provider      text NOT NULL,
  redirect_uri  text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  code          text,
  error         text,
  received_at   timestamptz
);

-- Strava activities, linked to the Garmin activity of the same workout when there is one (Garmin
-- uploads to Strava, so most runs are both).
CREATE TABLE IF NOT EXISTS health.synced_strava_activities (
  profile_id          text NOT NULL REFERENCES core.profiles(id) ON DELETE CASCADE,
  strava_id           text NOT NULL,
  name                text,
  description         text,
  sport               text NOT NULL,
  start_time          timestamptz NOT NULL,
  distance_m          double precision,
  duration_s          double precision,
  garmin_activity_id  text,
  raw                 jsonb,
  synced_at           timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, strava_id)
);
CREATE INDEX IF NOT EXISTS synced_strava_activities_profile_start_idx
  ON health.synced_strava_activities(profile_id, start_time DESC);
CREATE INDEX IF NOT EXISTS synced_strava_activities_garmin_idx
  ON health.synced_strava_activities(profile_id, garmin_activity_id);

-- Writes to the sources, run in order by the connectors service. target: garmin | strava | withings.
-- op (garmin): send_workout, remove_workout, add_weight, edit_activity; (strava): edit_activity.
CREATE TABLE IF NOT EXISTS health.outbox (
  id            text PRIMARY KEY,
  profile_id    text NOT NULL REFERENCES core.profiles(id) ON DELETE CASCADE,
  target        text NOT NULL,
  op            text NOT NULL,
  payload       jsonb NOT NULL,
  state         text NOT NULL DEFAULT 'queued',   -- queued | running | done | failed | unsupported
  result        jsonb,
  error         text,
  requested_by  text,                              -- 'app', 'claude', or the extension that asked
  requested_at  timestamptz NOT NULL DEFAULT now(),
  started_at    timestamptz,
  finished_at   timestamptz
);
CREATE INDEX IF NOT EXISTS outbox_queued_idx ON health.outbox(requested_at) WHERE state = 'queued';
CREATE INDEX IF NOT EXISTS outbox_profile_idx ON health.outbox(profile_id, requested_at DESC);

-- Workouts this app put on the Garmin calendar, by the caller's own reference (e.g. a training
-- session id): sending the same ref again replaces the workout, and the calendar does not show
-- them twice (once from here, once synced back from Garmin).
CREATE TABLE IF NOT EXISTS health.pushed_workouts (
  profile_id         text NOT NULL REFERENCES core.profiles(id) ON DELETE CASCADE,
  ref                text NOT NULL,
  garmin_workout_id  text,
  schedule_id        text,
  day                date,
  title              text,
  sport              text,
  updated_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, ref)
);

-- Per-profile switches of the connectors (e.g. copy new Withings weigh-ins to Garmin), set from the
-- settings panel or by Claude, read by the service.
CREATE TABLE IF NOT EXISTS health.connector_options (
  profile_id  text NOT NULL REFERENCES core.profiles(id) ON DELETE CASCADE,
  key         text NOT NULL,
  value       jsonb NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, key)
);
