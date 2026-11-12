-- A pop-up kitchen's logo (#296): the Sanity image asset id of its own mark,
-- as main_image_asset is of its picture. NULL when it has none. Only a
-- pop-up kitchen's goes on the website (home's Food board, its card and its
-- page); its Instagram is its link, page_url. Records are in
-- ops/site/src/events/server/event-model.js; only adapters/d1-events.js
-- knows this column.

ALTER TABLE events ADD COLUMN logo_asset TEXT;
