-- Guests (#127): newsletter subscribers and website form submissions, moved
-- from Baserow's Website database. Ids are Baserow's row ids.

-- One row per address: signing up again only adds the new tag.
CREATE TABLE IF NOT EXISTS subscribers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  tags TEXT NOT NULL DEFAULT '[]',
  signed_up_on TEXT,
  synced INTEGER NOT NULL DEFAULT 0
);

-- The Mailchimp sync's hourly query.
CREATE INDEX IF NOT EXISTS subscribers_synced ON subscribers (synced, id);

-- One row per version: a resubmitted verified form adds a row and clears
-- `current` on the earlier ones.
CREATE TABLE IF NOT EXISTS form_submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  form_slug TEXT NOT NULL DEFAULT '',
  form_title TEXT NOT NULL DEFAULT '',
  submitted_at TEXT,
  reply_to TEXT NOT NULL DEFAULT '' COLLATE NOCASE,
  status TEXT NOT NULL DEFAULT '',
  current INTEGER NOT NULL DEFAULT 0,
  answers TEXT,
  notify_sent_at TEXT,
  receipt_sent_at TEXT,
  edit_link TEXT NOT NULL DEFAULT ''
);

-- A form's submissions from one address (resubmits, the confirm link).
CREATE INDEX IF NOT EXISTS form_submissions_reply_to ON form_submissions (form_slug, reply_to);
-- Ops' list: current submissions, newest first.
CREATE INDEX IF NOT EXISTS form_submissions_current ON form_submissions (current, submitted_at);
