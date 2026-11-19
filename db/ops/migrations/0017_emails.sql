-- One-off emails to the mailing list (#348, ops/site/src/email): written in
-- ops from sections (shared/email/sections.js) between the fixed logo and
-- foot. `sections` is their JSON list. `status` moves draft → scheduled →
-- sending → sent, or ends at failed (`reason` says why); only a draft can be
-- changed or deleted. ONE_OFF_STATUSES in
-- ops/site/src/email/server/one-off-email-model.js. Sending and scheduling
-- (campaign_id, scheduled_for, sent_at, recipients) come in the next step.
CREATE TABLE IF NOT EXISTS emails (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subject TEXT NOT NULL DEFAULT '',
  preview_text TEXT NOT NULL DEFAULT '',
  sections TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'draft',
  campaign_id TEXT NOT NULL DEFAULT '',
  campaign_web_id TEXT NOT NULL DEFAULT '',
  recipients INTEGER NOT NULL DEFAULT 0,
  reason TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL DEFAULT '',
  updated_by TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  scheduled_for TEXT,
  sent_at TEXT
);

CREATE INDEX IF NOT EXISTS emails_updated_at ON emails (updated_at);
