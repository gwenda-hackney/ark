-- Events (#127): a series and its nights, moved from the Baserow "Events" and
-- "Event dates" tables. Ids are Baserow's row ids, so ops routes, Sanity
-- documents and calendar links keep pointing at the same series and nights.
-- Only the D1 events adapter (ops/site/src/events/server/adapters/d1-events.js)
-- reads or writes these.

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL DEFAULT '',
  artist TEXT NOT NULL DEFAULT '',
  offer TEXT NOT NULL DEFAULT '',
  page_url TEXT NOT NULL DEFAULT '',
  short_description TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  operations_notes TEXT NOT NULL DEFAULT '',
  -- JSON array of addresses
  image_links TEXT NOT NULL DEFAULT '[]',
  starts_on TEXT,
  time TEXT NOT NULL DEFAULT '',
  start_time TEXT NOT NULL DEFAULT '',
  end_time TEXT NOT NULL DEFAULT '',
  -- JSON array of { label, startTime, endTime }
  night_schedule TEXT NOT NULL DEFAULT '[]',
  repeat_every INTEGER NOT NULL DEFAULT 1,
  -- none, once, day, week or month (REPEAT_UNITS in event-model.js)
  repeat_unit TEXT NOT NULL DEFAULT 'none',
  -- JSON array: "mon", "tue", …
  weekdays TEXT NOT NULL DEFAULT '[]',
  month_day INTEGER NOT NULL DEFAULT 0,
  ends_on TEXT,
  -- JSON arrays of YYYY-MM-DD
  skipped_dates TEXT NOT NULL DEFAULT '[]',
  extra_dates TEXT NOT NULL DEFAULT '[]',
  slug TEXT NOT NULL DEFAULT '',
  -- JSON array of the addresses the series had before
  former_slugs TEXT NOT NULL DEFAULT '[]',
  deleted_at TEXT,
  taking_applications INTEGER NOT NULL DEFAULT 0,
  replaces_series TEXT NOT NULL DEFAULT '',
  drive_folder_id TEXT NOT NULL DEFAULT '',
  -- Sanity image asset id (#183)
  main_image_asset TEXT,
  -- JSON hero framing, or NULL
  hero_crops TEXT,
  -- JSON array of { key, asset, date, added, source }, newest first
  gallery TEXT NOT NULL DEFAULT '[]'
);

CREATE INDEX IF NOT EXISTS events_slug ON events (slug);

-- A night of a series. Removing a series removes its nights; a night copied
-- from Baserow without a series keeps event_id NULL.
CREATE TABLE IF NOT EXISTS event_dates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER REFERENCES events (id) ON DELETE CASCADE,
  date TEXT,
  slug TEXT NOT NULL DEFAULT '',
  label TEXT NOT NULL DEFAULT '',
  sanity_id TEXT NOT NULL DEFAULT '',
  clickup_task_id TEXT NOT NULL DEFAULT '',
  -- JSON object: what was last sent to Sanity, per target
  publish_snapshots TEXT NOT NULL DEFAULT '{}',
  google_calendar_event_id TEXT NOT NULL DEFAULT '',
  -- JSON object: this night's own name, times, image and so on (NightRecord.overrides)
  overrides TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS event_dates_event_id ON event_dates (event_id, date);
CREATE INDEX IF NOT EXISTS event_dates_date ON event_dates (date);
CREATE INDEX IF NOT EXISTS event_dates_slug ON event_dates (slug);
