-- training/003: an own exercise can have photos too, from the same source as the built-in ones (Free Exercise
-- DB, public domain): `photo` names that database's exercise, whose start (0) and end (1) pictures are kept here
-- once fetched, so they show without reaching the internet again.
ALTER TABLE training.library ADD COLUMN IF NOT EXISTS photo text CHECK (photo IS NULL OR photo ~ '^[A-Za-z0-9_-]{1,100}$');

CREATE TABLE IF NOT EXISTS training.photos (
  profile_id  text NOT NULL REFERENCES core.profiles(id) ON DELETE CASCADE,
  source_id   text NOT NULL,                     -- the Free Exercise DB id, e.g. Lying_Leg_Curls
  frame       smallint NOT NULL CHECK (frame IN (0, 1)),
  mime        text NOT NULL,
  bytes       bytea NOT NULL,
  fetched_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, source_id, frame)
);
