-- A pop-up kitchen's own colour (#319): "#0f4d32", lower case, or NULL /
-- '' for none. The website shows its name in it on home's Food board, its
-- card on What's on and its heading on /kitchen; only a pop-up kitchen's
-- goes there. Records are in ops/site/src/events/server/event-model.js;
-- only adapters/d1-events.js knows this column. Additive.

ALTER TABLE events ADD COLUMN accent_color TEXT;
