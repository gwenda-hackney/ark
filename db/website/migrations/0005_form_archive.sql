-- When ops archived a submission (dealt with, or spam): it leaves the
-- Enquiries list unless "Show archived" is on (#390). NULL means open.
ALTER TABLE form_submissions ADD COLUMN archived_at TEXT;
