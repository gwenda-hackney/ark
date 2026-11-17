-- Menus (#305): a menu guests see, such as Drinks or a pop-up kitchen's
-- Chez Pickle, with its own name, dates and days. Its chapters are the
-- top-level menu_sections that name it in menu_id; a group follows its
-- chapter, so its menu_id is NULL. Records are in
-- ops/site/src/menu/server/menu-model.js; only adapters/d1-menu.js knows
-- these tables.
--
-- kind: 'bar' (drinks) or 'kitchen' (food). starts_on and ends_on are
-- YYYY-MM-DD; '' is no start, and an empty end (NULL or '') is ongoing.
-- days: the weekdays it runs, 'thu,fri,sat' Monday first; '' is every day.
-- popup_series_id: the pop-up kitchen it belongs to, an event series' id
-- (the events domain's, so not a foreign key). `order` is a keyword, so the
-- column is sort_order.
--
-- Additive only: menu_sections keeps its own kind and popup_series_id,
-- which the code before menus reads, until a clean-up after the release
-- drops them. Until then ops writes them to match the chapter's menu.

CREATE TABLE IF NOT EXISTS menus (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL DEFAULT '',
  slug TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT 'bar',
  starts_on TEXT NOT NULL DEFAULT '',
  ends_on TEXT,
  days TEXT NOT NULL DEFAULT '',
  popup_series_id INTEGER,
  sort_order REAL
);
CREATE INDEX IF NOT EXISTS menus_popup ON menus (popup_series_id);

ALTER TABLE menu_sections ADD COLUMN menu_id INTEGER REFERENCES menus(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS menu_sections_menu ON menu_sections (menu_id);
