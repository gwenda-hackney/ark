-- Party facts (#240), part of the venue details (ops/site/src/venue): how many
-- fit standing and seated, what's included (a few lines, one thing on each),
-- and how soon we reply ("a day"). One row (id 1), written whole on each
-- save; no row means never saved. Every fact may be blank (NULL capacity,
-- '' text), and the website leaves a blank one out. Records are in
-- ops/site/src/venue/parties-model.js; only adapters/d1-venue.js knows this
-- table. No seed: blank until the venue fills them in.

CREATE TABLE IF NOT EXISTS venue_parties (
  id INTEGER PRIMARY KEY,
  standing INTEGER,
  seated INTEGER,
  included TEXT NOT NULL DEFAULT '',
  reply_within TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT '',
  updated_by TEXT NOT NULL DEFAULT ''
);
