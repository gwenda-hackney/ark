-- The venue's gallery (#291), part of the venue details (ops/site/src/venue):
-- the venue's own photos, which the website shows in home's photo strip and at
-- the top of the Photos page, in this order. Event and pop-up kitchen photos
-- are not here: they live on each event (events.gallery).
--
-- One row a photo. `photo_key` is the photo's own key (the Sanity array item's
-- _key); `asset` is its Sanity image asset id, the photo's only copy, and is in
-- the gallery once. `position` orders the gallery, 0 first; only the order
-- matters, not the numbers. `menu` is the board on home it may be pinned up on
-- ('drinks', 'food' or ''). Records are in ops/site/src/venue/gallery-model.js;
-- only adapters/d1-venue.js knows this table.

CREATE TABLE IF NOT EXISTS venue_gallery (
  id INTEGER PRIMARY KEY,
  photo_key TEXT NOT NULL UNIQUE,
  asset TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  menu TEXT NOT NULL DEFAULT '',
  position INTEGER NOT NULL DEFAULT 0,
  added_at TEXT NOT NULL DEFAULT '',
  added_by TEXT NOT NULL DEFAULT ''
);
