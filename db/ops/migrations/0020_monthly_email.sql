-- The what's on email goes monthly (ops/site/src/email): each run is now a
-- month's, named by its first day ("2026-12-01"), so week_start becomes
-- period_start. The runs from the weekly days keep their Monday: none of
-- them is a 1st, so no month's run is ever mistaken for one of theirs. The
-- UNIQUE index (weekly_emails_week) follows the column by itself.
ALTER TABLE weekly_emails RENAME COLUMN week_start TO period_start;
