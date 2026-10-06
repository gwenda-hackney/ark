-- The menu and inventory (#127): Baserow's Menu Sections, POS Menus, Menu
-- Items (and their POS menus link), Menu placements, Inventory, Ingredients,
-- Suppliers and Inventory suppliers. Ids are Baserow's row ids. Records are
-- in ops/site/src/menu/server/menu-model.js; only adapters/d1-menu.js knows
-- these tables. `order` is a keyword, so the column is sort_order.

CREATE TABLE IF NOT EXISTS menu_sections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL DEFAULT '',
  slug TEXT NOT NULL DEFAULT '',
  subtitle TEXT NOT NULL DEFAULT '',
  parent_id INTEGER REFERENCES menu_sections(id) ON DELETE SET NULL,
  sort_order REAL,
  sanity_id TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS menu_sections_parent ON menu_sections (parent_id);

CREATE TABLE IF NOT EXISTS pos_menus (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL DEFAULT '',
  sort_order REAL,
  is_default INTEGER NOT NULL DEFAULT 0
);

-- prices and publish_snapshots are JSON. photo_asset is a Sanity image id (#183).
CREATE TABLE IF NOT EXISTS menu_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL DEFAULT '',
  section_id INTEGER REFERENCES menu_sections(id) ON DELETE SET NULL,
  menu_line TEXT NOT NULL DEFAULT '',
  lock_menu_line INTEGER NOT NULL DEFAULT 0,
  price TEXT NOT NULL DEFAULT '',
  alt_price TEXT NOT NULL DEFAULT '',
  prices TEXT,
  drink_type TEXT NOT NULL DEFAULT '',
  cocktail_type TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  glassware TEXT NOT NULL DEFAULT '',
  garnish TEXT NOT NULL DEFAULT '',
  ice TEXT NOT NULL DEFAULT '',
  method TEXT NOT NULL DEFAULT '',
  signature INTEGER NOT NULL DEFAULT 0,
  abv TEXT NOT NULL DEFAULT '',
  volume TEXT NOT NULL DEFAULT '',
  abv_override INTEGER NOT NULL DEFAULT 0,
  volume_override INTEGER NOT NULL DEFAULT 0,
  producer TEXT NOT NULL DEFAULT '',
  photo_asset TEXT NOT NULL DEFAULT '',
  sort_order REAL,
  sanity_id TEXT NOT NULL DEFAULT '',
  on_digital_menu INTEGER NOT NULL DEFAULT 1,
  on_print_menu INTEGER NOT NULL DEFAULT 1,
  publish_snapshots TEXT,
  analysis_note TEXT NOT NULL DEFAULT '',
  lightspeed_sku TEXT NOT NULL DEFAULT '',
  lightspeed_sku_alt TEXT NOT NULL DEFAULT '',
  lightspeed_name TEXT NOT NULL DEFAULT '',
  lightspeed_menu_screen TEXT NOT NULL DEFAULT '',
  lightspeed_status TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS menu_items_section ON menu_items (section_id);

-- A drink's POS menus (Baserow's Menu Items "POS menus" link).
CREATE TABLE IF NOT EXISTS menu_item_pos_menus (
  item_id INTEGER NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  pos_menu_id INTEGER NOT NULL REFERENCES pos_menus(id) ON DELETE CASCADE,
  PRIMARY KEY (item_id, pos_menu_id)
);
CREATE INDEX IF NOT EXISTS menu_item_pos_menus_menu ON menu_item_pos_menus (pos_menu_id);

CREATE TABLE IF NOT EXISTS menu_placements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER REFERENCES menu_items(id) ON DELETE CASCADE,
  channel TEXT NOT NULL DEFAULT '',
  section_id INTEGER REFERENCES menu_sections(id) ON DELETE SET NULL,
  pos_menu_id INTEGER REFERENCES pos_menus(id) ON DELETE SET NULL,
  pos_screen TEXT NOT NULL DEFAULT '',
  sort_order REAL
);
CREATE INDEX IF NOT EXISTS menu_placements_item ON menu_placements (item_id);
CREATE INDEX IF NOT EXISTS menu_placements_section ON menu_placements (section_id);
CREATE INDEX IF NOT EXISTS menu_placements_pos_menu ON menu_placements (pos_menu_id);

CREATE TABLE IF NOT EXISTS inventory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL DEFAULT '',
  full_name TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT '',
  abv TEXT NOT NULL DEFAULT '',
  default_unit TEXT NOT NULL DEFAULT '',
  estimated_cost REAL,
  notes TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  lightspeed_sku TEXT NOT NULL DEFAULT '',
  actual_qty REAL,
  actual_unit TEXT NOT NULL DEFAULT '',
  counted_at TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS ingredients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL DEFAULT '',
  item_id INTEGER REFERENCES menu_items(id) ON DELETE CASCADE,
  inventory_id INTEGER REFERENCES inventory(id) ON DELETE SET NULL,
  quantity REAL,
  unit TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  abv TEXT NOT NULL DEFAULT '',
  sort_order REAL
);
CREATE INDEX IF NOT EXISTS ingredients_item ON ingredients (item_id);
CREATE INDEX IF NOT EXISTS ingredients_inventory ON ingredients (inventory_id);

CREATE TABLE IF NOT EXISTS suppliers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL DEFAULT '',
  website TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT ''
);

-- Which supplier sells a stock item, with their SKU, pack and trade price.
CREATE TABLE IF NOT EXISTS inventory_suppliers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL DEFAULT '',
  inventory_id INTEGER REFERENCES inventory(id) ON DELETE CASCADE,
  supplier_id INTEGER REFERENCES suppliers(id) ON DELETE CASCADE,
  product_url TEXT NOT NULL DEFAULT '',
  sku TEXT NOT NULL DEFAULT '',
  pack TEXT NOT NULL DEFAULT '',
  price REAL
);
CREATE INDEX IF NOT EXISTS inventory_suppliers_inventory ON inventory_suppliers (inventory_id);
CREATE INDEX IF NOT EXISTS inventory_suppliers_supplier ON inventory_suppliers (supplier_id);
