-- Occasions (#353): something on sale for a while that leads to an enquiry,
-- such as Christmas parties, set up in ops and shown on the website's home
-- page between `show_from` and `show_until` (inclusive, London days). Not an
-- event: it has no nights. (0017 is the one-off emails table, #348.)
--
-- One row an occasion. `image_asset` is its picture's Sanity image asset id
-- ('' for none), `image_alt` the picture's description. `included` is what's
-- included, one thing a line; `covers` says when it's for in words
-- ("Throughout December"). Records are in ops/site/src/occasions/occasion-model.js;
-- only adapters/d1-occasions.js knows this table.

CREATE TABLE IF NOT EXISTS occasions (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  line TEXT NOT NULL DEFAULT '',
  included TEXT NOT NULL DEFAULT '',
  covers TEXT NOT NULL DEFAULT '',
  show_from TEXT NOT NULL DEFAULT '',
  show_until TEXT NOT NULL DEFAULT '',
  image_asset TEXT NOT NULL DEFAULT '',
  image_alt TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT '',
  updated_by TEXT NOT NULL DEFAULT ''
);
