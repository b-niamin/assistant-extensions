-- training/002: a workout is an ordered list of items (a run, an exercise from the library, the sauna),
-- many plans with exactly one active, and the profile's own library entries.

-- One active plan per profile. The newest plan that was still 'active' becomes the active one, once: the
-- guard keeps a re-run (or a profile that already chose) as it is.
ALTER TABLE training.plans ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT false;
UPDATE training.plans pl SET active = true
 WHERE pl.id IN (SELECT DISTINCT ON (profile_id) id FROM training.plans WHERE status = 'active' ORDER BY profile_id, created_at DESC)
   AND NOT EXISTS (SELECT 1 FROM training.plans x WHERE x.profile_id = pl.profile_id AND x.active);
CREATE UNIQUE INDEX IF NOT EXISTS plans_one_active_idx ON training.plans(profile_id) WHERE active;

-- The items of a workout: [{kind: 'cardio', sport, name?, duration_min?, distance_m?, steps?, note?, done?}
-- or {kind: 'exercise', ref?, name, unit: reps|seconds|minutes, sets: [{reps, kg, seconds, done}], rest_s?, note?}].
-- Sessions written before keep `steps`/`exercises`; the app reads them as items. `sport` stays the main sport.
ALTER TABLE training.sessions ADD COLUMN IF NOT EXISTS items jsonb;
ALTER TABLE training.templates ADD COLUMN IF NOT EXISTS items jsonb;

-- The profile's own library entries, next to the built-in ones in web/lib/library.ts.
CREATE TABLE IF NOT EXISTS training.library (
  id          text PRIMARY KEY,
  profile_id  text NOT NULL REFERENCES core.profiles(id) ON DELETE CASCADE,
  name        text NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
  kind        text NOT NULL CHECK (kind IN ('cardio', 'exercise')),
  sport       text,                              -- cardio: its sport
  unit        text CHECK (unit IN ('reps', 'seconds', 'minutes')),
  muscles     text[] NOT NULL DEFAULT '{}',
  description text CHECK (length(description) <= 2000),
  cautions    jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS library_profile_idx ON training.library(profile_id);
