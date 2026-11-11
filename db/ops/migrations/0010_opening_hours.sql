-- Opening hours (#240), part of the venue details (ops/site/src/venue): the week, one row per
-- day, Monday (id 1) to Sunday (id 7). Times are London wall-clock 'HH:MM';
-- a close earlier than the opening is after midnight (Saturday 16:00–01:00).
-- A closed day keeps no times. Who saved the week last, and when, is on
-- every row (a save writes all seven). Records are in
-- ops/site/src/venue/hours-model.js; only adapters/d1-venue.js knows this table.
-- 0009 is the weekly email's (feat/240-weekly-email-ops).

CREATE TABLE IF NOT EXISTS opening_hours (
  id INTEGER PRIMARY KEY,
  day TEXT NOT NULL UNIQUE,
  closed INTEGER NOT NULL DEFAULT 0,
  opens TEXT NOT NULL DEFAULT '',
  closes TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT '',
  updated_by TEXT NOT NULL DEFAULT ''
);
