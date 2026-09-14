# Gwenda ClickUp Data Dictionary

Two ClickUp lists back this system: **Stock** and **Menu Recipes**.

---

## Stock list (`901219316533`)

Each task is a single purchasable stock item (a spirit, mixer, garnish, etc.).

| Field | ClickUp ID | Type | Written by | Description |
|-------|-----------|------|-----------|-------------|
| **Name** | _(task name)_ | text | Human | Display name of the stock item (e.g. `Sipsmith London Dry Gin`). |
| **Type** | `57edf3e3` | drop_down | Human | Broad category: `Liquor`, `Mixer`, `Garnish`, `Other`. Used for filtering and reporting. |
| **Sub-type** | `77a36be1` | drop_down | Human | Finer category within Type (e.g. `Gin`, `Rum`, `Syrup`). Optional. |
| **Source** | `2c499d3e` | drop_down | Human | Supplier or sourcing channel. Optional metadata. |
| **Stock unit** | `3998a369` | drop_down | Human | Unit of measure for this stock item. One of: `ml`, `each`, `kg`. Drives all cost calculations. |
| **Unit amount** | `344740a6` | number | Human | How many base units are in one purchased item. For `ml` stock: ml per bottle (e.g. `700`). For `kg` stock: grams per unit (e.g. `1000`). For `each` stock: always `1`. |
| **Order quantity** | `68bedefd` | number | Human | How many items are in one purchase order (e.g. `6` for a six-pack, `1` for a single bottle). Defaults to `1`. |
| **Cost** | `2d11a98b` | currency | Human | Total purchase price for one order (i.e. for `Order quantity` items). In GBP. |
| **Initial Stock Qty** | `3dbf0671` | number | Script _(planned)_ | Number of individual items to stock initially, derived from estimated weekly recipe demand × weeks to cover. |
| **Ext Cost** | `705d56da` | formula | ClickUp | `Cost × Initial Stock Qty` — total cash needed for the initial order of this item. |
| **Inventory value** | `1814abca` | formula | ClickUp | Similar to Ext Cost; may duplicate it. Review before deleting. |
| **Import to POS** | `51d5c3fd` | checkbox | Human | Flag for POS system integration. Not yet wired to code. |
| **Notes** | `52d60d9a` | text | Human | Free-form notes (supplier contacts, quality comments, etc.). |
| **Pour tier** | `f8cb6bdf` | drop_down | Human | Grouping for pricing tiers. Not yet used by code. |
| **Menu Item** | `782d5472` | tasks | Webhook | Back-link to all Menu Recipe tasks that use this stock item. Written automatically. |

### Derived values (computed in code, not stored as fields)

| Value | Formula |
|-------|---------|
| `costPerBaseUnit` | `Cost ÷ (Order quantity × Unit amount)` — cost per ml, per item, or per gram |

### Defunct / to delete

| Field | ClickUp ID | Reason |
|-------|-----------|--------|
| ~~Bottle size (ml)~~ | `2c8b8ed5` | Replaced by **Unit amount** + **Order quantity**. Migration complete. |
| ~~_test_cpm~~ | `dfefb6b9` | Dev test formula. Never used in production. |
| ~~Price per unit~~ | `5fcb7ba7` | Old ClickUp formula for cost-per-ml. Replaced by webhook logic. |

---

## Menu Recipes list (`901219335128`)

Each **parent task** is a recipe. Each **subtask** (child) is one ingredient line within that recipe.

### Recipe (parent task) fields

| Field | ClickUp ID | Type | Written by | Description |
|-------|-----------|------|-----------|-------------|
| **Name** | _(task name)_ | text | Human | Name of the menu item (e.g. `Negroni`). |
| **Menu Type** | `85ddfcbc` | drop_down | Human | Menu section (e.g. `Cocktails`, `Beer`, `Soft Drinks`). Used for filtering and menu layout. |
| **Recipe summary** | `5bd43b45` | text | Human / Webhook | Human-readable notes about the recipe. Also used as the smoke-test write target. |
| **Target Pour Cost** | `3ba6bd55` | number | Human | Desired ratio of ingredient cost to selling price (e.g. `0.20` = 20%). Industry norm is 18–22% for cocktails, 30–35% for draught beer, 10% for postmix. |
| **Target cost** | `661acd74` | currency | Webhook | Selling price implied by dividing Recipe cost by Target Pour Cost. Written automatically. |
| **Suggested Price** | `26d65ec1` | number | Webhook | Smoothed menu price. Derived from Target cost using a tiered algorithm that applies slight uplifts for backbone cocktails and slight markdowns for showcase items, with a £0.50 rounding snap. |
| **Recipe cost** | `47a5d814` | currency | Webhook | Sum of all ingredient Extended line cost values. Total input cost of one serve. Written automatically. |

### Ingredient (subtask) fields

Subtasks inherit all fields from the parent list. Only the fields below are relevant on ingredient tasks.

| Field | ClickUp ID | Type | Written by | Description |
|-------|-----------|------|-----------|-------------|
| **Name** | _(task name)_ | text | Human | Ingredient label (e.g. `Sipsmith Gin 45ml`). |
| **Ingredient** | `af09f6ef` | tasks | Human | Link to the Stock list task for this ingredient. Required — the webhook reads the stock model through this link. |
| **Unit** | `0ea0a504` | drop_down | Human | Unit of measure for this ingredient **in the recipe**. Must be compatible with the stock item's **Stock unit**: `ml`/`cl`/`dash`/`barspoon` for `ml` stock; `each`/`slice`/`top` for `each` or `kg` stock. |
| **Qty** | `3aef390f` | number | Human | How much of the ingredient this recipe uses, in the above Unit. |
| **Unit cost** | `991f0882` | currency | Webhook | Cost per one recipe unit (e.g. cost per ml). Written automatically. |
| **Extended line cost** | `77b29d86` | currency | Webhook | `Qty × Unit cost` — total cost of this ingredient line. Written automatically. |

### Formula fields (review before deleting)

| Field | ClickUp ID | Type | Notes |
|-------|-----------|------|-------|
| **Target Price** | `262e4bbf` | formula | ClickUp formula — likely duplicates **Target cost** (webhook-written). Confirm whether any views or automations depend on this before removing. |
| **Line ext cost** | `2a458935` | formula | ClickUp formula — likely duplicates **Extended line cost** (webhook-written). Same caveat. |

---

## Unit compatibility rules

| Stock unit | Valid recipe units |
|-----------|--------------------|
| `ml` | `ml`, `cl`, `dash`, `barspoon` |
| `each` | `each`, `slice`, `top` |
| `kg` | `each`, `slice`, `top` _(quantity of the physical item, e.g. 1 lemon wedge)_ |

## Unit conversions (configured in `wrangler.toml`)

| Constant | Value | Meaning |
|----------|-------|---------|
| `DASH_ML` | `1.75` | ml per dash |
| `BAR_SPOON_ML` | `5` | ml per barspoon |
| `CL_ML` | `10` | ml per cl |
