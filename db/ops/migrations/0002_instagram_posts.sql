-- Instagram posts made from ops (#26): one row per attempt to post an event
-- or one of its nights. Only adapters/d1-posts.js knows this table.
CREATE TABLE IF NOT EXISTS instagram_posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  -- The ops event id (Baserow's row id, kept when events move to D1). No
  -- foreign key yet: events are still in Baserow. Adding it later is a table
  -- rebuild (PRAGMA defer_foreign_keys).
  event_id INTEGER NOT NULL,
  -- YYYY-MM-DD; NULL for a post about the series or a special as a whole.
  night_on TEXT,
  -- feed (constants in post-model.js)
  format TEXT NOT NULL DEFAULT 'feed',
  caption TEXT NOT NULL DEFAULT '',
  -- The Sanity asset id, and the exact image address sent to Instagram.
  image_asset TEXT,
  image_url TEXT,
  -- publishing | sent | failed (constants in post-model.js)
  status TEXT NOT NULL,
  container_id TEXT,
  media_id TEXT,
  permalink TEXT,
  posted_by TEXT NOT NULL DEFAULT '',
  last_error TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  sent_at TEXT
);

CREATE INDEX IF NOT EXISTS instagram_posts_event ON instagram_posts (event_id, night_on);

-- One post in flight per night: the double-post guard is enforced by the database.
CREATE UNIQUE INDEX IF NOT EXISTS instagram_posts_in_flight
  ON instagram_posts (event_id, IFNULL(night_on, ''))
  WHERE status = 'publishing';
