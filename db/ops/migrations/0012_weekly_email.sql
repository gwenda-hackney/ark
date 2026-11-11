-- The weekly "what's on" email (#240, ops/site/src/email).
--
-- weekly_emails: what happened to each week's email. A week is its Monday
-- (London). `attempt` 1 is the week's own email, the only one the schedule
-- ever makes; 2 and up exist only when an admin chose "Send again". The
-- UNIQUE pair is what makes a send happen once: whoever inserts the row has
-- the week, and a second trigger (the cron firing twice, a retried request)
-- inserts nothing. `status` moves preparing → waiting → sending → sent, or
-- ends at skipped (no nights that week) or failed (`reason` says why).
-- WEEKLY_EMAIL_STATUSES in ops/site/src/email/server/weekly-email-model.js.
CREATE TABLE IF NOT EXISTS weekly_emails (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  week_start TEXT NOT NULL,
  attempt INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'preparing',
  started_by TEXT NOT NULL DEFAULT 'schedule',
  subject TEXT NOT NULL DEFAULT '',
  preheader TEXT NOT NULL DEFAULT '',
  campaign_id TEXT NOT NULL DEFAULT '',
  campaign_web_id TEXT NOT NULL DEFAULT '',
  recipients INTEGER NOT NULL DEFAULT 0,
  reason TEXT NOT NULL DEFAULT '',
  approved_by TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  sent_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS weekly_emails_week ON weekly_emails (week_start, attempt);

-- Test emails staff sent themselves, to keep them to a few an hour.
CREATE TABLE IF NOT EXISTS weekly_email_tests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL COLLATE NOCASE,
  sent_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS weekly_email_tests_sent_at ON weekly_email_tests (sent_at);
