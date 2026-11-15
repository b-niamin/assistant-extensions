-- training/001: plans and sessions of any discipline (running, cycling, the gym, ...), and the gym log.
-- Claude drives most of it through the training__* tools; the page shows the week and logs a session.
CREATE SCHEMA IF NOT EXISTS training;

-- A plan: a goal over a stretch of days ("Half marathon in 12 weeks"). Sessions may also stand alone.
CREATE TABLE IF NOT EXISTS training.plans (
  id          text PRIMARY KEY,
  profile_id  text NOT NULL REFERENCES core.profiles(id) ON DELETE CASCADE,
  name        text NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  goal        text CHECK (length(goal) <= 1000),
  sport       text,                              -- the main discipline, or NULL for a mixed plan
  start_day   date,
  end_day     date,
  status      text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'done', 'archived')),
  notes       text CHECK (length(notes) <= 4000),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (end_day IS NULL OR start_day IS NULL OR end_day >= start_day)
);
CREATE INDEX IF NOT EXISTS plans_profile_idx ON training.plans(profile_id, status);

-- One session on a day. Endurance: `steps` (the structured workout, the shape health__send_workout takes)
-- and/or duration/distance. Strength: `exercises` [{name, sets: [{reps, kg, seconds}], rest_s, note}].
-- Logging fills `result` ({exercises: [... sets with done], rpe, note, started_at, finished_at}).
CREATE TABLE IF NOT EXISTS training.sessions (
  id            text PRIMARY KEY,
  profile_id    text NOT NULL REFERENCES core.profiles(id) ON DELETE CASCADE,
  plan_id       text REFERENCES training.plans(id) ON DELETE SET NULL,
  day           date NOT NULL,
  time_local    text CHECK (time_local ~ '^\d{2}:\d{2}$'),
  sport         text NOT NULL,
  title         text NOT NULL CHECK (length(title) BETWEEN 1 AND 120),
  description   text CHECK (length(description) <= 4000),
  duration_min  integer CHECK (duration_min BETWEEN 1 AND 1440),
  distance_m    double precision CHECK (distance_m > 0),
  steps         jsonb,
  exercises     jsonb,
  status        text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'done', 'skipped')),
  result        jsonb,
  done_at       timestamptz,
  -- The real activity this session became (e.g. a Garmin activity id), set when Claude matches it.
  activity_ref  text,
  -- When it was put on the watch (Claude, through health__send_workout with ref "training:<id>").
  sent_at       timestamptz,
  source        text,                            -- 'gym' for history imported from the Gym Tracker
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sessions_profile_day_idx ON training.sessions(profile_id, day);
CREATE INDEX IF NOT EXISTS sessions_plan_idx ON training.sessions(plan_id);

-- Reusable workouts ("Full body A"): start a session from one in a tap. Imported gym plans land here.
CREATE TABLE IF NOT EXISTS training.templates (
  id          text PRIMARY KEY,
  profile_id  text NOT NULL REFERENCES core.profiles(id) ON DELETE CASCADE,
  name        text NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  sport       text NOT NULL,
  description text CHECK (length(description) <= 4000),
  steps       jsonb,
  exercises   jsonb,
  used_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS templates_profile_idx ON training.templates(profile_id);
