-- calendar/001: the calendar's own entries (shared by every profile). Subscribed calendars are not stored:
-- they are fetched when someone looks; other extensions' entries stay in those extensions.
CREATE SCHEMA IF NOT EXISTS calendar;

CREATE TABLE IF NOT EXISTS calendar.entries (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title       text NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  all_day     boolean NOT NULL,
  -- timed entries: instants; end >= start
  start_at    timestamptz,
  end_at      timestamptz,
  -- all-day entries: days, end exclusive (a one-day entry ends the next day)
  start_day   date,
  end_day     date,
  location    text CHECK (length(location) <= 200),
  note        text CHECK (length(note) <= 1000),
  -- who added it: a profile id, or 'claude' for the MCP tools
  created_by  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (all_day AND start_day IS NOT NULL AND end_day > start_day AND start_at IS NULL AND end_at IS NULL) OR
    (NOT all_day AND start_at IS NOT NULL AND end_at >= start_at AND start_day IS NULL AND end_day IS NULL)
  )
);
CREATE INDEX IF NOT EXISTS entries_start_at_idx ON calendar.entries (start_at);
CREATE INDEX IF NOT EXISTS entries_start_day_idx ON calendar.entries (start_day);
