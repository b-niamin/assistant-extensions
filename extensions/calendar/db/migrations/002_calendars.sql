-- calendar/002: calendars instead of one list of "my entries". A calendar holds entries added here or by
-- Claude, or stands for a subscription (its link stays in the secret "links"; feed_id is that link's id,
-- web/lib/feeds.server.ts). Each has a name and a colour (a shell hue).
CREATE TABLE IF NOT EXISTS calendar.calendars (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name        text NOT NULL CHECK (length(name) BETWEEN 1 AND 60),
  hue         text NOT NULL DEFAULT 'blue' CHECK (hue IN ('blue', 'orange', 'aqua', 'yellow', 'magenta', 'green', 'violet', 'red')),
  feed_id     text UNIQUE CHECK (feed_id ~ '^[0-9a-f]{10}$'),
  created_by  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE calendar.entries ADD COLUMN IF NOT EXISTS calendar_id bigint REFERENCES calendar.calendars (id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS entries_calendar_idx ON calendar.entries (calendar_id);

-- Entries from before calendars existed go into one calendar named "Calendar" (rename it on the page).
INSERT INTO calendar.calendars (name, hue)
SELECT 'Calendar', 'blue'
 WHERE EXISTS (SELECT 1 FROM calendar.entries WHERE calendar_id IS NULL)
   AND NOT EXISTS (SELECT 1 FROM calendar.calendars WHERE feed_id IS NULL);
UPDATE calendar.entries
   SET calendar_id = (SELECT min(id) FROM calendar.calendars WHERE feed_id IS NULL)
 WHERE calendar_id IS NULL;
