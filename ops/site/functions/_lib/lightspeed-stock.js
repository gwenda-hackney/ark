/**
 * Lightspeed K-Series item-library CSV against ops.
 *
 * Lightspeed has one Item list. Sellable drinks, kegs, and garnishes are all
 * "items" so a recipe can decrement stock. Ops splits that: Menu Items are
 * drinks guests buy; Inventory is stock. Export combines them back.
 */
import { parseMoney } from "./suppliers.js";
import { itemSlug, namesClash as sameItemName } from "./item-key.js";
import { flattenMenuSections } from "./menu-sections.js";
import { DEFAULT_POS_MENU_NAME } from "./pos-menu-store.js";

export const DEFAULT_LIGHTSPEED_MENU = DEFAULT_POS_MENU_NAME;
export { LIVE_POS_MENU_NAME } from "./pos-menu-store.js";

/** First path segment is a Lightspeed menu, not a screen. */
const LIGHTSPEED_MENU_ALIASES = new Set([
  "gwenda",
  "live",
  "fall menu",
  "fall 2026",
  "gwenda next",
]);

/** Official Lightspeed formatted export column order (their files). */
export const LIGHTSPEED_ITEM_HEADERS = [
  "SKU",
  "Name",
  "Parent SKU",
  "Min - Max",
  "Type",
  "Default price",
  "Extra price",
  "Accounting group",
  "Menu/Screen",
  "Button name",
  "Button color",
  "Button style",
  "Barcode",
  "Cost price",
  "Package content (stock management)",
  "Package unit (stock management)",
  "Weight",
  "Tare (grams, selling by weight)",
  "Sharing status",
  "Docket name",
  "Course",
  "Statistics group",
  "Production instruction",
];

/**
 * Official File import template ("New items import sheet" / New FLATFILE import).
 * https://docs.google.com/spreadsheets/d/1TCn94CpzvpBOEngpycm2l9-Vma1mXMaYEn3YaupTD0k
 * Map identical column names, not Map identical columns with AI.
 * Back Office maps Price (docs/export often say Default price), Sharing mode
 * (export says Sharing status), and Package unit (stock mngmt)
 * (template/export often say stock management).
 */
export const LIGHTSPEED_IMPORT_HEADERS = [
  "SKU",
  "Name",
  "Parent SKU",
  "Type",
  "Min - Max",
  "Production instruction",
  "Price",
  "Extra price",
  "Accounting group",
  "Course",
  "Statistics group",
  "Menu/Screen",
  "Button name",
  "Button color",
  "Barcode",
  "Cost price",
  "Sharing mode",
  "Docket name",
  "Package content (stock mngmt)",
  "Package unit (stock mngmt)",
  "Weight",
  "Tare (grams, selling by weight)",
];

/**
 * Columns we actually fill for drink File import. Unused optional columns are
 * omitted (Lightspeed recommends deleting empty optional columns).
 */
export const LIGHTSPEED_IMPORT_USED_HEADERS = [
  "SKU",
  "Name",
  "Type",
  "Price",
  "Accounting group",
  "Menu/Screen",
  "Button name",
  "Button color",
  "Sharing mode",
];

/** Stock rows also set package unit. */
export const LIGHTSPEED_INVENTORY_IMPORT_HEADERS = [
  ...LIGHTSPEED_IMPORT_USED_HEADERS.filter((header) => header !== "Menu/Screen"),
  "Package unit (stock mngmt)",
];

/**
 * Combined File import: drinks (Menu/Screen) + inventory (Package unit).
 * One Lightspeed Item list for sellable buttons and recipe stock.
 */
export const LIGHTSPEED_COMBINED_IMPORT_HEADERS = [
  ...LIGHTSPEED_IMPORT_USED_HEADERS,
  "Package unit (stock mngmt)",
];

export const LIGHTSPEED_STATUSES = ["matched", "mismatch", "missing"];

/** Same columns as drink item import. */
export const LIGHTSPEED_UPDATE_HEADERS = LIGHTSPEED_IMPORT_USED_HEADERS;

const HEADER_ALIASES = {
  sku: ["sku", "item sku", "product sku"],
  name: ["name", "product", "item name", "item"],
  stockName: ["stock name"],
  quantity: [
    "total quantity",
    "quantity",
    "counted quantity",
    "counted qty",
    "qty",
    "unpacked quantity",
  ],
  unit: [
    "package unit",
    "package unit (stock management)",
    "package unit (stock mngmt)",
    "unit",
    "uom",
    "content uom",
  ],
  type: ["type", "item type"],
  accountingGroup: ["accounting group", "accountinggroup"],
  costPrice: ["cost price", "cost"],
  packageContent: [
    "package content",
    "package content (stock management)",
    "package content (stock mngmt)",
    "content value",
  ],
  defaultPrice: ["default price", "price"],
  menuScreen: ["menu screen", "menu", "screen"],
  statisticsGroup: ["statistics group"],
  buttonName: ["button name"],
  sharingStatus: ["sharing mode", "sharing status", "sharing", "link status"],
};

export const LIGHTSPEED_ARCHIVE_KEY = "lightspeed.archive_skus";

function parseQty(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const raw = String(value ?? "")
    .trim()
    .replace(/,/g, "");
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export function parseCsvLine(line, sep = ",") {
  const out = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i += 1;
        continue;
      }
      if (ch === '"') {
        inQuotes = false;
        continue;
      }
      current += ch;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === sep) {
      out.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  out.push(current);
  return out;
}

/** Lightspeed formatted exports use `;`. A comma inside Tare's header is not a column. */
export function csvDelimiter(line) {
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        i += 1;
        continue;
      }
      if (ch === '"') inQuotes = false;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ";") return ";";
  }
  return ",";
}

function normalizeHeader(value) {
  return String(value || "")
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/[_/]+/g, " ")
    .replace(/\s+/g, " ");
}

function headerIndex(headers) {
  const map = new Map();
  headers.forEach((header, index) => {
    const key = normalizeHeader(header);
    if (key && !map.has(key)) map.set(key, index);
  });
  return map;
}

function cell(cols, index, aliases) {
  for (const alias of aliases) {
    if (index.has(alias)) return String(cols[index.get(alias)] ?? "").trim();
  }
  return "";
}

function csvLines(text) {
  return String(text || "")
    .split(/\r?\n/)
    .filter((line) => line.trim());
}

export function itemLibraryHeaderIndex(text) {
  const lines = csvLines(text);
  if (!lines.length) return headerIndex([]);
  const sep = csvDelimiter(lines[0]);
  return headerIndex(parseCsvLine(lines[0], sep));
}

export function hasItemLibraryHeaders(text) {
  const index = itemLibraryHeaderIndex(text);
  return HEADER_ALIASES.type.some((alias) => index.has(alias));
}

export function normalizeName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function rowKey(row) {
  const sku = String(row?.sku || "")
    .trim()
    .toUpperCase();
  if (sku) return `sku:${sku}`;
  const name = normalizeName(row?.name);
  return name ? `name:${name}` : "";
}

function itemLibraryError() {
  const error = new Error(
    "This page is POS menu items. Export the Lightspeed formatted item list (Menu > Item list). Stock-level files are not used here.",
  );
  error.status = 400;
  return error;
}

export function parseLightspeedCsv(text) {
  const lines = csvLines(text);
  if (lines.length < 2) return [];
  const sep = csvDelimiter(lines[0]);
  const headers = parseCsvLine(lines[0], sep);
  const index = headerIndex(headers);
  const hasSku = HEADER_ALIASES.sku.some((alias) => index.has(alias));
  const hasName =
    HEADER_ALIASES.name.some((alias) => index.has(alias)) ||
    HEADER_ALIASES.stockName.some((alias) => index.has(alias));
  if (!hasSku && !hasName) {
    const error = new Error(
      "CSV needs a SKU or Name/Product column from a Lightspeed export.",
    );
    error.status = 400;
    throw error;
  }

  const rows = [];
  const seen = new Set();
  for (const line of lines.slice(1)) {
    const cols = parseCsvLine(line, sep);
    const sku = cell(cols, index, HEADER_ALIASES.sku).toUpperCase();
    const productName = cell(cols, index, HEADER_ALIASES.name);
    const stockName = cell(cols, index, HEADER_ALIASES.stockName);
    const name = productName || stockName;
    const quantity = parseQty(cell(cols, index, HEADER_ALIASES.quantity));
    const unit = cell(cols, index, HEADER_ALIASES.unit);
    const type = cell(cols, index, HEADER_ALIASES.type);
    const accountingGroup = cell(cols, index, HEADER_ALIASES.accountingGroup);
    const costPrice = parseMoney(cell(cols, index, HEADER_ALIASES.costPrice));
    const packageContent = cell(cols, index, HEADER_ALIASES.packageContent);
    const defaultPrice = parseMoney(cell(cols, index, HEADER_ALIASES.defaultPrice));
    const menuScreen = cell(cols, index, HEADER_ALIASES.menuScreen);
    const statisticsGroup = cell(cols, index, HEADER_ALIASES.statisticsGroup);
    const buttonName = cell(cols, index, HEADER_ALIASES.buttonName);
    if (!sku && !name) continue;
    const row = {
      sku: sku || undefined,
      name: name || undefined,
      quantity,
      unit: unit || undefined,
      type: type || undefined,
      accountingGroup: accountingGroup || undefined,
      costPrice,
      packageContent: packageContent || undefined,
      defaultPrice,
      menuScreen: menuScreen || undefined,
      statisticsGroup: statisticsGroup || undefined,
      buttonName: buttonName || undefined,
    };
    const key = rowKey(row);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    rows.push({ ...row, key });
  }
  return rows;
}

/** Official item-list export only. Rejects stock-level quantity files. */
export function parseLightspeedItemCsv(text) {
  if (!hasItemLibraryHeaders(text)) throw itemLibraryError();
  return parseLightspeedCsv(text);
}

function displayNameDiffers(ops, lsName) {
  const incoming = normalizeName(lsName);
  if (!incoming) return false;
  const opsName = normalizeName(ops.name);
  const opsFull = normalizeName(ops.fullName);
  if (!opsName && !opsFull) return false;
  return incoming !== opsName && incoming !== opsFull;
}

function sameNameIdentity(ops, lsName) {
  return sameItemName(ops?.name, lsName) || sameItemName(ops?.fullName, lsName);
}

function lookupByName(byName, bySlug, value) {
  const exact = normalizeName(value);
  if (exact && byName.has(exact)) return { item: byName.get(exact), via: "name" };
  const slug = itemSlug(value);
  if (slug && bySlug.has(slug)) return { item: bySlug.get(slug), via: "slug" };
  return { item: undefined, via: "" };
}

/** Pint / half / bottle / shot suffixes Lightspeed uses as separate SKUs for one ops drink. */
export function serveBaseName(name) {
  return String(name || "")
    .replace(
      /\s*\((?:pint|half(?:\s*pint)?|btl|bottle|dbl|double|25ml|35ml|50ml|75ml|125ml|250ml|330ml|33cl|75cl|70cl)\)\s*$/i,
      "",
    )
    .replace(
      /\s+(?:pint|half(?:\s*pint)?|bottle|330ml|33cl|75cl|70cl|50cl|25ml|50ml)\s*$/i,
      "",
    )
    .trim();
}

function isAltServeOf(ops, row) {
  const opsBase = serveBaseName(ops?.name) || String(ops?.name || "").trim();
  const lsBase =
    serveBaseName(row?.name) ||
    serveBaseName(row?.buttonName) ||
    String(row?.name || "").trim();
  if (!opsBase || !lsBase) return false;
  return sameItemName(opsBase, lsBase) || itemSlug(opsBase) === itemSlug(lsBase);
}

const SYSTEM_NAME =
  /^(service charge|extra shot|misc|double shot|single shot premium)(\b|$)/i;
const INGREDIENT_NAME =
  /bitters?$|syrup|cordial|powder|salt|pepper|cinnamon|mint$|basil$|lemon$|lime$|sugar$|wash$|grenadine|angostura|chilli|chili|cardamon|cardamom|coconut wash|fig syrup|maple|simple syrup|sea salt|white pepper|orange bitter/i;

/**
 * Lightspeed Item list rows are not all drinks.
 * sellable: guest can buy it.
 * stock: keg, bottle, garnish. Must exist as an Item so recipes can decrement it.
 * system: modifiers, service charge, extra shot.
 */
export function classifyLightspeedRow(row) {
  const type = String(row?.type || "").toLowerCase();
  const name = String(row?.name || "").trim();
  if (!name) return "system";
  if (
    type.includes("modifier") ||
    type === "group" ||
    type === "combo" ||
    type === "sub-item" ||
    type === "subitem"
  ) {
    return "system";
  }
  if (SYSTEM_NAME.test(name) || /^extra shot/i.test(name)) return "system";
  if (/\bkeg\b/i.test(name)) return "stock";
  const price =
    typeof row?.defaultPrice === "number" && Number.isFinite(row.defaultPrice)
      ? row.defaultPrice
      : 0;
  const pkg = parseQty(row?.packageContent);
  if (pkg != null && pkg > 1 && price <= 0) return "stock";
  const stats = String(row?.statisticsGroup || "");
  if (/\/Ingredients\b/i.test(stats)) return "stock";
  const group = String(row?.accountingGroup || "");
  if (/^food$/i.test(group) && price <= 0) return "stock";
  const onMenu = Boolean(String(row?.menuScreen || "").trim());
  if (price <= 0 && !onMenu && INGREDIENT_NAME.test(name)) return "stock";
  return "sellable";
}

/**
 * Match Lightspeed rows to ops catalog rows.
 * SKU first, then exact name, then slug (St-Germain / St Germain), then button name.
 */
export function matchLightspeedRows(opsItems, lsRows, { allowAltServes = false } = {}) {
  const items = Array.isArray(opsItems) ? opsItems : [];
  const rows = Array.isArray(lsRows) ? lsRows : [];
  const bySku = new Map();
  const byName = new Map();
  const bySlug = new Map();
  for (const item of items) {
    const sku = String(item.lightspeedSku || "")
      .trim()
      .toUpperCase();
    if (sku && !bySku.has(sku)) bySku.set(sku, item);
    const names = [item.name, item.fullName].filter(Boolean);
    for (const name of names) {
      const exact = normalizeName(name);
      if (exact && !byName.has(exact)) byName.set(exact, item);
      const slug = itemSlug(name);
      if (slug && !bySlug.has(slug)) bySlug.set(slug, item);
    }
  }

  const used = new Set();
  const matched = [];
  const conflicts = [];
  const lightspeedOnly = [];
  const altServes = [];

  for (const row of rows) {
    const sku = String(row.sku || "")
      .trim()
      .toUpperCase();
    let item = sku ? bySku.get(sku) : undefined;
    let via = item ? "sku" : "";
    if (!item) {
      const hit = lookupByName(byName, bySlug, row.name);
      item = hit.item;
      via = hit.via;
    }
    if (!item && row.buttonName) {
      const hit = lookupByName(byName, bySlug, row.buttonName);
      if (hit.item) {
        item = hit.item;
        via = "button";
      }
    }
    if (!item) {
      const base = serveBaseName(row.name) || serveBaseName(row.buttonName);
      if (base && base !== row.name) {
        const hit = lookupByName(byName, bySlug, base);
        if (hit.item) {
          item = hit.item;
          via = "serve";
        }
      }
    }
    if (item && used.has(item._id || item.id)) {
      if (allowAltServes && isAltServeOf(item, row)) {
        altServes.push({ ops: item, lightspeed: row, via: via || "serve" });
        continue;
      }
      lightspeedOnly.push(row);
      continue;
    }
    if (!item) {
      lightspeedOnly.push(row);
      continue;
    }
    used.add(item._id || item.id);
    const entry = {
      ops: item,
      lightspeed: row,
      via,
    };
    if (
      via === "sku" &&
      displayNameDiffers(item, row.name) &&
      !sameNameIdentity(item, row.name) &&
      !isAltServeOf(item, row)
    ) {
      conflicts.push(entry);
    } else {
      matched.push(entry);
    }
  }

  const opsOnly = items.filter((item) => !used.has(item._id || item.id));
  return { matched, conflicts, lightspeedOnly, opsOnly, altServes };
}

export function matchLightspeedCatalog({ menuItems = [], inventory = [] }, lsRows) {
  const rows = Array.isArray(lsRows) ? lsRows : [];
  const sellable = [];
  const stock = [];
  const system = [];
  for (const row of rows) {
    const role = classifyLightspeedRow(row);
    const next = { ...row, role };
    if (role === "stock") stock.push(next);
    else if (role === "system") system.push(next);
    else sellable.push(next);
  }
  const menu = matchLightspeedRows(menuItems, sellable, { allowAltServes: true });
  const stockMatch = matchLightspeedRows(inventory, stock);
  return {
    matched: menu.matched,
    conflicts: menu.conflicts,
    opsOnly: menu.opsOnly,
    altServes: menu.altServes,
    lightspeedOnly: menu.lightspeedOnly,
    stockMatched: stockMatch.matched,
    stockConflicts: stockMatch.conflicts,
    stockOnly: stockMatch.lightspeedOnly,
    stockOpsOnly: stockMatch.opsOnly,
    systemOnly: system,
    unusedInventory: unusedInventoryItems(inventory, menuItems),
  };
}

export function isServiceChargeRow(row) {
  const sku = String(row?.sku || "")
    .trim()
    .toUpperCase();
  if (sku === "SVC1") return true;
  return /^service charge/i.test(String(row?.name || "").trim());
}

export function collectRecipeInventoryRefs(menuItems) {
  const ids = new Set();
  const names = [];
  for (const item of menuItems || []) {
    for (const ing of item.ingredients || []) {
      if (ing.inventoryId) ids.add(String(ing.inventoryId));
      const name = String(ing.name || "").trim();
      if (name) names.push(name);
    }
  }
  return { ids, names };
}

/** Keep kegs, recipe lines, and bottles we sell as drinks. */
export function inventoryIsNeeded(item, menuItems, refs) {
  const name = String(item?.name || "").trim();
  if (!name) return false;
  if (/\bkeg\b/i.test(name)) return true;
  const id = String(item?._id || item?.id || "");
  if (id && refs.ids.has(id)) return true;
  if (refs.names.some((ingName) => sameItemName(ingName, name))) return true;
  return (menuItems || []).some((drink) => sameItemName(drink.name, name));
}

export function unusedInventoryItems(inventory, menuItems) {
  const refs = collectRecipeInventoryRefs(menuItems);
  return (inventory || []).filter(
    (item) =>
      String(item?.name || "").trim() &&
      !inventoryIsNeeded(item, menuItems, refs),
  );
}

export function lightspeedRowMatchesInventory(row, item) {
  const rowSku = String(row?.sku || "")
    .trim()
    .toUpperCase();
  const itemSku = String(item?.lightspeedSku || "")
    .trim()
    .toUpperCase();
  if (rowSku && itemSku && rowSku === itemSku) return true;
  if (sameItemName(row?.name, item?.name) || sameItemName(row?.buttonName, item?.name)) {
    return true;
  }
  const left = itemSlug(serveBaseName(row?.name));
  const right = itemSlug(serveBaseName(item?.name));
  return Boolean(left && right && left === right);
}

function pullUnusedInventoryLeftovers(rows, unusedInventory) {
  const pending = [];
  const extra = [];
  for (const row of rows || []) {
    if (isServiceChargeRow(row)) {
      pending.push(row);
      continue;
    }
    const hit = (unusedInventory || []).some((item) =>
      lightspeedRowMatchesInventory(row, item),
    );
    if (hit) extra.push(row);
    else pending.push(row);
  }
  return { pending, extra };
}

function fail(status, message) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

export function nameTokens(value) {
  return itemSlug(value)
    .split("-")
    .filter((part) => part.length > 1);
}

export function nameOverlapScore(a, b) {
  const left = new Set(nameTokens(a));
  const right = nameTokens(b);
  if (!left.size || !right.length) return 0;
  let hits = 0;
  for (const token of right) {
    if (left.has(token)) hits += 1;
  }
  return hits;
}

/** Rank candidate drinks so close names (Amaro del Capo) float first. */
export function rankByName(targetName, items, getName) {
  const nameOf = typeof getName === "function" ? getName : (item) => item?.name;
  return [...(items || [])].sort((a, b) => {
    const diff =
      nameOverlapScore(targetName, nameOf(b)) -
      nameOverlapScore(targetName, nameOf(a));
    if (diff) return diff;
    return String(nameOf(a) || "").localeCompare(String(nameOf(b) || ""));
  });
}

/**
 * Pair leftover Lightspeed rows with unmatched ops drinks.
 * Writes the real Lightspeed SKU. Optionally adopts the POS name.
 */
export function resolveManualLinks(opsItems, lsRows, links) {
  const items = Array.isArray(opsItems) ? opsItems : [];
  const rows = Array.isArray(lsRows) ? lsRows : [];
  const byId = new Map(
    items.map((item) => [String(item._id || item.id || ""), item]),
  );
  const bySku = new Map();
  for (const row of rows) {
    const sku = String(row.sku || "")
      .trim()
      .toUpperCase();
    if (sku && !bySku.has(sku)) bySku.set(sku, row);
  }
  const skuOwners = new Map();
  for (const item of items) {
    const sku = String(item.lightspeedSku || "")
      .trim()
      .toUpperCase();
    if (sku) skuOwners.set(sku, item);
  }

  const patches = [];
  for (const link of Array.isArray(links) ? links : []) {
    const id = String(link?.itemId || link?.id || "").trim();
    const sku = String(link?.sku || "")
      .trim()
      .toUpperCase();
    const item = id ? byId.get(id) : undefined;
    const row = sku ? bySku.get(sku) : undefined;
    if (!id || !item) fail(400, "Pick a menu item to match.");
    if (!sku) fail(400, "Pick a Lightspeed item to match.");
    if (!row) fail(400, "That SKU is not in this file.");
    const owner = skuOwners.get(sku);
    const ownerId = String(owner?._id || owner?.id || "");
    if (owner && ownerId !== id) {
      fail(409, `SKU ${sku} is already on ${owner.name || "another drink"}.`);
    }
    const adoptName = Boolean(link?.adoptName);
    const drinkName = String(link?.name || row.name || "").trim();
    patches.push({
      id,
      lightspeedSku: sku,
      lightspeedName:
        serveBaseName(row.buttonName) || serveBaseName(row.name) || "",
      lightspeedMenuScreen: serializePosScreens(
        posScreenPaths({ lightspeedMenuScreen: row.menuScreen }),
      ),
      lightspeedStatus: "matched",
      adoptName,
      name: adoptName ? drinkName : undefined,
    });
    skuOwners.set(sku, item);
  }
  return patches;
}

function csvEscape(value, sep = ";") {
  const raw = value == null ? "" : String(value);
  if (
    raw.includes('"') ||
    raw.includes("\n") ||
    raw.includes("\r") ||
    raw.includes(sep) ||
    raw.includes(",")
  ) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
}

function joinCsv(values, sep = ";") {
  return values.map((value) => csvEscape(value, sep)).join(sep);
}

export function assignedLightspeedSku(item) {
  return storedLightspeedSku(item);
}

export function storedLightspeedSku(item) {
  return String(item?.lightspeedSku || "")
    .trim()
    .toUpperCase();
}

export function storedLightspeedSkuAlt(item) {
  return String(item?.lightspeedSkuAlt || "")
    .trim()
    .toUpperCase();
}

/** Export-grid id for the alt serve (double / half) of a drink. */
export function altServeExportId(item) {
  const id = String(item?._id || item?.id || "").trim();
  if (!id) return "";
  return id.startsWith("alt:") ? id : `alt:${id}`;
}

export function parseAltServeExportId(raw) {
  const value = String(raw || "");
  return value.startsWith("alt:") ? value.slice(4) : "";
}

/**
 * Size labels for separate POS buttons.
 * Cocktail/pour → Single + Double; draught beer / soft drinks → Pint + Half pint;
 * packaged → none (unless Soft Drinks section).
 */
export function lightspeedServeSizeLabels(drinkType) {
  const kind = String(drinkType || "")
    .trim()
    .toLowerCase();
  if (kind === "beer") return { primary: "Pint", alt: "Half pint" };
  if (kind === "postmix") return { primary: "Pint", alt: "Half pint" };
  if (kind === "packaged") return { primary: "Price" };
  if (kind === "pour" || kind === "cocktail" || !kind) {
    return { primary: "Single", alt: "Double" };
  }
  return { primary: "Single", alt: "Double" };
}

export function isBottledBeer(item) {
  return normalizeName(sectionTitleOf(item)) === "bottled beer";
}

export function isSoftDrink(item) {
  if (normalizeName(sectionTitleOf(item)) === "soft drinks") return true;
  return (
    String(item?.drinkType || "")
      .trim()
      .toLowerCase() === "postmix"
  );
}

export function isDraughtBeer(item) {
  const section = normalizeName(sectionTitleOf(item));
  if (section === "bottled beer") return false;
  if (section === "draught beer" || section === "beer") return true;
  return (
    String(item?.drinkType || "")
      .trim()
      .toLowerCase() === "beer" && !isBottledBeer(item)
  );
}

/** Draught beer and postmix soft drinks share pint / half till buttons. */
export function isPintHalfServe(item) {
  return isDraughtBeer(item) || isSoftDrink(item);
}

export function lightspeedServeSizeLabelsForItem(item) {
  if (isBottledBeer(item)) return { primary: "Price" };
  if (isPintHalfServe(item)) return { primary: "Pint", alt: "Half pint" };
  return lightspeedServeSizeLabels(item?.drinkType);
}

/** Till label without serve size — uses POS name when set. */
export function posBaseName(item) {
  const fromPos = serveBaseName(item?.lightspeedName);
  if (fromPos) return fromPos;
  return serveBaseName(item?.name) || String(item?.name || "").trim();
}

/**
 * Till button label.
 * Uses Lightspeed name (POS short name) when set, then a short serve tag:
 * draught / soft → (Pint)/(Half), bottled beer → (Bottle), pour/cocktail alt → (Double).
 */
export function lightspeedButtonName(item) {
  const base = posBaseName(item);
  if (!base) return "";
  if (isBottledBeer(item)) {
    if (/\(\s*(?:bottle|btl)\s*\)\s*$/i.test(base)) return base;
    return `${base} (Bottle)`;
  }
  const serve = item?._exportServe;
  if (serve === "alt") {
    if (isPintHalfServe(item)) return `${base} (Half)`;
    return `${base} (Double)`;
  }
  if (serve === "primary" && isPintHalfServe(item)) {
    return `${base} (Pint)`;
  }
  return base;
}

function altServePrice(item) {
  const explicit = parseMoney(item?.priceAlt);
  if (explicit != null) {
    if (isBottledBeer(item)) return null;
    return explicit;
  }
  // Draught beer / soft drinks: half always (Alt price or half the pint).
  if (!isPintHalfServe(item)) return null;
  const primary = parseMoney(item?.price);
  if (primary == null) return null;
  return Math.round((primary / 2) * 100) / 100;
}

/**
 * Lightspeed Item Name for a serve. Soft drinks / postmix keep `(pint)` /
 * `(half)` so bare inventory names (G0100 Coca-Cola) stay unique. Draught beer
 * primaries stay bare (G0022 Tiny Rebel IPA); halves use `(half pint)`.
 */
export function lightspeedServeItemName(item, serve = "primary") {
  const base = String(item?.name || "").trim();
  if (!base) return "";
  if (isSoftDrink(item)) {
    return serve === "alt" ? `${base} (half)` : `${base} (pint)`;
  }
  if (serve === "alt" && isPintHalfServe(item)) {
    return `${base} (half pint)`;
  }
  if (serve === "alt") {
    const labels = lightspeedServeSizeLabelsForItem(item);
    const suffix = String(labels.alt || "double").toLowerCase();
    return `${base} (${suffix})`;
  }
  return base;
}

/**
 * Expand drinks into two Item rows when they have an alt serve:
 * cocktail/pour with alt price → single + double; draught beer / soft drinks →
 * pint + half (half always, using Alt price or half the pint).
 * Alt rows use id `alt:{menuItemId}` and `lightspeedSkuAlt`.
 * Soft-drink Item Names include (pint)/(half); Button name uses POS name.
 */
export function expandMenuItemsForLightspeedExport(items) {
  const out = [];
  for (const item of items || []) {
    const baseId = String(item?._id || item?.id || "").trim();
    out.push({
      ...item,
      _id: baseId,
      id: baseId,
      _exportServe: "primary",
      name: lightspeedServeItemName(item, "primary"),
    });
    const altPrice = altServePrice(item);
    const labels = lightspeedServeSizeLabelsForItem(item);
    if (altPrice == null || !labels.alt || !baseId) continue;
    if (isBottledBeer(item)) continue;
    const altId = altServeExportId({ _id: baseId });
    out.push({
      ...item,
      _id: altId,
      id: altId,
      _exportServe: "alt",
      _sourceMenuItemId: baseId,
      name: lightspeedServeItemName(item, "alt"),
      price: String(altPrice),
      priceAlt: undefined,
      lightspeedSku: storedLightspeedSkuAlt(item),
      lightspeedSkuAlt: undefined,
    });
  }
  return out;
}

/**
 * Prefix for ops-allocated Lightspeed SKUs (G0001, G0002, …).
 * Must not continue Lightspeed’s bare numeric sequence (103, 114, 189, …)
 * or we risk colliding with SKUs created later in Back Office.
 */
export const LIGHTSPEED_OPS_SKU_PREFIX = "G";
/** Fixed zero-pad width so codes always line up (G0001 … G9999). */
export const LIGHTSPEED_OPS_SKU_PAD = 4;

function formatOpsLightspeedSku(n, prefix = LIGHTSPEED_OPS_SKU_PREFIX, pad = LIGHTSPEED_OPS_SKU_PAD) {
  return `${prefix}${String(n).padStart(pad, "0")}`;
}

/** Highest N among PREFIX+N SKUs (e.g. G012 → 12). Ignores bare numbers and other codes. */
export function maxPrefixedLightspeedSku(skus, prefix = LIGHTSPEED_OPS_SKU_PREFIX) {
  const re = new RegExp(`^${escapeRegExp(prefix)}(\\d+)$`, "i");
  let max = 0;
  for (const raw of skus || []) {
    const sku = String(raw || "").trim();
    const m = sku.match(re);
    if (!m) continue;
    const n = Number(m[1]);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max;
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Fill missing Lightspeed SKUs with the next free prefixed code (G0001, G0002, …).
 * Order is stable by Baserow id so the same drink keeps the same code.
 * Does not continue Lightspeed’s bare integers.
 */
export function withAllocatedLightspeedSkus(
  items,
  {
    reserved = [],
    prefix = LIGHTSPEED_OPS_SKU_PREFIX,
    pad = LIGHTSPEED_OPS_SKU_PAD,
  } = {},
) {
  const list = Array.isArray(items) ? items : [];
  const used = new Set();
  for (const raw of reserved) {
    const sku = String(raw || "")
      .trim()
      .toUpperCase();
    if (sku) used.add(sku);
  }
  for (const item of list) {
    const sku = storedLightspeedSku(item);
    if (sku) used.add(sku);
  }
  let next = maxPrefixedLightspeedSku([...used], prefix) + 1;
  if (next < 1) next = 1;

  const ranked = [...list].sort((a, b) => {
    const ai = Number(String(a?._id || a?.id || "").replace(/\D/g, "")) || 0;
    const bi = Number(String(b?._id || b?.id || "").replace(/\D/g, "")) || 0;
    return ai - bi || String(a?.name || "").localeCompare(String(b?.name || ""));
  });

  const byId = new Map();
  for (const item of ranked) {
    const id = String(item?._id || item?.id || "");
    const existing = storedLightspeedSku(item);
    if (existing) {
      byId.set(id, existing);
      continue;
    }
    let sku = formatOpsLightspeedSku(next, prefix, pad);
    while (used.has(sku.toUpperCase())) {
      next += 1;
      sku = formatOpsLightspeedSku(next, prefix, pad);
    }
    used.add(sku.toUpperCase());
    byId.set(id, sku);
    next += 1;
  }

  return list.map((item) => {
    const id = String(item?._id || item?.id || "");
    const sku = byId.get(id) || storedLightspeedSku(item);
    return sku ? { ...item, lightspeedSku: sku } : { ...item };
  });
}

/** Items that received a newly allocated SKU (not already stored on the drink). */
export function newlyAllocatedLightspeedSkus(beforeItems, afterItems) {
  const before = new Map(
    (beforeItems || []).map((item) => [
      String(item?._id || item?.id || ""),
      storedLightspeedSku(item),
    ]),
  );
  const out = [];
  for (const item of afterItems || []) {
    const id = String(item?._id || item?.id || "");
    if (!id) continue;
    const next = storedLightspeedSku(item);
    if (!next || before.get(id)) continue;
    out.push({ id, lightspeedSku: next });
  }
  return out;
}

/** Flat ops drinks from the nested section tree. */
export function collectMenuItems(sections) {
  const out = [];
  for (const section of flattenMenuSections(sections)) {
    for (const item of section.items || []) {
      out.push({
        ...item,
        section: item.section || {
          title: section.title,
          parentTitle: section.parentTitle,
        },
      });
    }
  }
  return out.sort((a, b) =>
    String(a.name || "").localeCompare(String(b.name || "")),
  );
}

/**
 * Default POS screen from the print-menu section (screen only, no menu name).
 * Matches the live Gwenda Item list layout where we already have buttons.
 */
export const POS_SCREEN_BY_SECTION = {
  "our formulas": "Signature Cocktails",
  spritz: "Spritz",
  negroni: "Classic Cocktails/Bitter",
  sour: "Classic Cocktails/Sours & Citrus",
  highball: "Classic Cocktails/Highball",
  "free of spirit": "Mocktails",
  mocktails: "Mocktails",
  mocktail: "Mocktails",
  "soft drinks": "Soft Drinks",
  "soft drink": "Soft Drinks",
  "amaro & digestivi": "Spirits/Liqueurs & Amari",
  "amaro and digestivi": "Spirits/Liqueurs & Amari",
  agave: "Spirits/Tequila",
  rum: "Spirits/Rums",
  whiskey: "Spirits/Whiskey & Brandy",
  whisky: "Spirits/Whiskey & Brandy",
  "bottled beer": "Beers",
  "draught beer": "Beers",
  beer: "Beers",
};

export function sectionTitleOf(item) {
  return String(
    item?.section?.title ||
      item?.sectionTitle ||
      (Array.isArray(item?.Section) ? item.Section[0]?.value : "") ||
      "",
  ).trim();
}

/** Suggested POS screen when the drink has none stored yet. */
export function defaultPosScreenForItem(item) {
  const sectionKey = normalizeName(sectionTitleOf(item));
  if (sectionKey && POS_SCREEN_BY_SECTION[sectionKey]) {
    return POS_SCREEN_BY_SECTION[sectionKey];
  }
  const kind = String(item?.drinkType || "").toLowerCase();
  if (kind === "beer") return "Beers";
  if (kind === "cocktail") return "Signature Cocktails";
  if (kind === "packaged" || kind === "postmix") return "Soft Drinks";
  if (kind === "pour") return "Spirits";
  return "";
}

export function normalizeLightspeedStatus(value) {
  const raw =
    typeof value === "string"
      ? value.trim().toLowerCase()
      : value && typeof value === "object" && typeof value.value === "string"
        ? value.value.trim().toLowerCase()
        : "";
  return LIGHTSPEED_STATUSES.includes(raw) ? raw : "";
}

export function accountingGroupForDrink(item) {
  const kind = String(item?.drinkType || "").toLowerCase();
  if (kind === "cocktail") return "Cocktails";
  if (kind === "beer") return "Beer";
  if (kind === "packaged" || kind === "postmix") return "Non-Alcoholic Drinks";
  return "Alcoholic Drinks";
}

export function formatLightspeedPrice(value) {
  const n = typeof value === "number" ? value : parseMoney(value);
  if (n == null) return "";
  if (Number.isInteger(n)) return String(n);
  return String(Math.round(n * 100) / 100);
}

/** Best-guess drink type when promoting a POS leftover into ops. */
export function drinkTypeFromLightspeedRow(row) {
  const group = normalizeName(row?.accountingGroup);
  if (group.includes("cocktail")) return "cocktail";
  if (group.includes("beer")) return "beer";
  if (group.includes("soft") || group.includes("postmix")) return "postmix";
  if (group.includes("non-alcoholic") || group.includes("food")) {
    return "packaged";
  }
  if (group.includes("alcoholic")) return "pour";
  const screen = normalizeName(row?.menuScreen);
  if (screen.includes("cocktail")) return "cocktail";
  if (screen.includes("beer")) return "beer";
  if (screen.includes("soft") || screen.includes("postmix")) return "postmix";
  if (screen.includes("non-alcoholic")) return "packaged";
  const stats = normalizeName(row?.statisticsGroup);
  if (stats.includes("cocktail")) return "cocktail";
  if (stats.includes("beer")) return "beer";
  if (stats.includes("soft") || stats.includes("postmix")) return "postmix";
  if (stats.includes("spirit") || stats.includes("wine")) return "pour";
  return "pour";
}

export function parseArchiveEntries(raw) {
  const text = String(raw || "").trim();
  if (!text) return [];
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = text.split(/[\n,]+/);
  }
  const out = [];
  const seen = new Set();
  for (const item of Array.isArray(parsed) ? parsed : []) {
    const sku = String(typeof item === "string" ? item : item?.sku || "")
      .trim()
      .toUpperCase();
    const name = String(typeof item === "string" ? "" : item?.name || "").trim();
    if (!sku || seen.has(sku)) continue;
    seen.add(sku);
    out.push({ sku, name });
  }
  return out;
}

export function mergeArchiveEntries(existing, rows) {
  const next = parseArchiveEntries(JSON.stringify(existing || []));
  const seen = new Set(next.map((entry) => entry.sku));
  for (const row of rows || []) {
    const sku = String(row?.sku || "")
      .trim()
      .toUpperCase();
    if (!sku || seen.has(sku)) continue;
    seen.add(sku);
    next.push({ sku, name: String(row?.name || "").trim() });
  }
  return next;
}

export function removeArchiveSkus(existing, skus) {
  const drop = new Set(
    (skus || [])
      .map((sku) => String(sku || "").trim().toUpperCase())
      .filter(Boolean),
  );
  return parseArchiveEntries(JSON.stringify(existing || [])).filter(
    (entry) => !drop.has(entry.sku),
  );
}

export function archiveSkuSet(entries) {
  return new Set(
    (entries || [])
      .map((entry) => String(entry?.sku || "").trim().toUpperCase())
      .filter(Boolean),
  );
}

/** Split POS-only rows into undecided leftovers vs marked-for-archive. */
export function partitionLightspeedOnly(rows, archiveEntries) {
  const marked = archiveSkuSet(archiveEntries);
  const pending = [];
  const archive = [];
  for (const row of rows || []) {
    const sku = String(row?.sku || "")
      .trim()
      .toUpperCase();
    if (sku && marked.has(sku)) archive.push(row);
    else pending.push(row);
  }
  return { pending, archive };
}

export function menuItemFromLightspeed(input) {
  const name = String(input?.name || "").trim();
  const sectionId = String(input?.sectionId || "").trim();
  const sku = String(input?.sku || input?.lightspeedSku || "")
    .trim()
    .toUpperCase();
  const drinkType = input?.drinkType || drinkTypeFromLightspeedRow(input);
  const price =
    input?.price != null && String(input.price).trim() !== ""
      ? String(input.price).trim()
      : formatLightspeedPrice(input?.defaultPrice);
  return {
    name,
    sectionId,
    drinkType,
    price,
    priceAlt: String(input?.priceAlt || "").trim() || undefined,
    lightspeedSku: sku,
    lightspeedName: name,
    lightspeedStatus: "matched",
    onPrintMenu: input?.onPrintMenu === true,
    onDigitalMenu: input?.onDigitalMenu === true,
    ...(Array.isArray(input?.posMenuIds) ? { posMenuIds: input.posMenuIds } : {}),
    lightspeedMenuScreen: serializePosScreens(
      posScreenPaths({ lightspeedMenuScreen: input?.menuScreen || input?.lightspeedMenuScreen }),
    ),
  };
}

export function menuScreenPath(item, menuName) {
  return menuScreenPathList(item, menuName).join(",");
}

/** Full Menu/Screen paths on the chosen POS menu. One entry per screen. */
export function menuScreenPathList(item, menuName) {
  const menu = String(menuName || "").trim() || DEFAULT_LIGHTSPEED_MENU;
  return menuScreenPlacements(item, menu).map((segs) =>
    joinMenuScreenParts([menu, ...segs]),
  );
}

/** True when the drink is linked to a POS menu by name. */
export function itemOnPosMenu(item, menuName) {
  const want = String(menuName || "")
    .trim()
    .toLowerCase();
  if (!want) return false;
  return (item?.posMenus || []).some(
    (menu) =>
      String(menu?.name || "")
        .trim()
        .toLowerCase() === want,
  );
}

/**
 * Menu/Screen for File import across the POS menus this drink sits on.
 * Fall 2026 + Gwenda overlap → both paths, comma-separated.
 */
export function menuScreenPathForMenus(item, menuNames) {
  const names = (Array.isArray(menuNames) ? menuNames : [menuNames])
    .map((name) => String(name || "").trim())
    .filter(Boolean);
  const assigned = names.filter((name) => itemOnPosMenu(item, name));
  const use = assigned.length ? assigned : names.slice(0, 1);
  const seen = new Set();
  const out = [];
  for (const menu of use) {
    for (const path of menuScreenPathList(item, menu)) {
      const key = path.toLowerCase();
      if (!path || seen.has(key)) continue;
      seen.add(key);
      out.push(path);
    }
  }
  return out.join(",");
}

/**
 * Screen segments under the chosen POS menu.
 * Stored values are screen paths (Spirits/Liqueurs & Amari). Legacy Lightspeed
 * exports that still start with Gwenda/Fall 2026/Live are stripped.
 */
export function menuScreenPlacements(item, menuName) {
  return posScreenPaths(item, menuName).map((path) => splitMenuScreenParts(path));
}

/** POS screens for Menu management import (no menu name). */
export function menuLayoutScreens(item, menuName) {
  return menuLayoutScreenRows(item, menuName)[0] || "";
}

export function menuLayoutScreenRows(item, menuName) {
  return menuScreenPlacements(item, menuName)
    .map((segs) => segs.join("##"))
    .filter(Boolean);
}

/**
 * Screen path after the Lightspeed menu name.
 * Gwenda/Spirits/Liqueurs & Amari → ["Spirits", "Liqueurs & Amari"]
 * Gwenda/Spritz → ["Spritz"]
 */
export function lightspeedScreenSegments(item, menuName) {
  return menuScreenPlacements(item, menuName)[0] || [];
}

export function isLightspeedMenuName(name, extraMenuNames = []) {
  const key = String(name || "")
    .trim()
    .toLowerCase();
  if (!key) return false;
  if (LIGHTSPEED_MENU_ALIASES.has(key)) return true;
  const extras = Array.isArray(extraMenuNames)
    ? extraMenuNames
    : extraMenuNames
      ? [extraMenuNames]
      : [];
  return extras.some(
    (entry) =>
      String(entry || "")
        .trim()
        .toLowerCase() === key,
  );
}

/** Screen paths stored on the drink, without a Lightspeed menu prefix. */
export function posScreenPaths(item, extraMenuNames = []) {
  const stored = String(item?.lightspeedMenuScreen || "").trim();
  const rawPaths = stored
    ? parseMenuScreenList(stored)
    : (() => {
        const fallback = defaultPosScreenForItem(item);
        return fallback ? [splitMenuScreenParts(fallback)] : [];
      })();
  const extra = Array.isArray(extraMenuNames)
    ? extraMenuNames
    : extraMenuNames
      ? [extraMenuNames]
      : [];
  const seen = new Set();
  const out = [];
  for (const parts of rawPaths) {
    const screenParts =
      parts.length && isLightspeedMenuName(parts[0], extra)
        ? parts.slice(1)
        : parts;
    const path = joinMenuScreenParts(screenParts);
    const key = path.toLowerCase();
    if (!path || seen.has(key)) continue;
    seen.add(key);
    out.push(path);
  }
  return out;
}

export function serializePosScreens(screens) {
  const seen = new Set();
  const out = [];
  for (const raw of screens || []) {
    const path = parsePosScreenInput(raw);
    const key = path.toLowerCase();
    if (!path || seen.has(key)) continue;
    seen.add(key);
    out.push(path);
  }
  return out.join(",");
}

export function posScreensLabel(item, extraMenuNames = []) {
  const paths = posScreenPaths(item, extraMenuNames);
  return paths.length ? paths.join(" · ") : "";
}

export function collectPosScreenSuggestions(items, extraMenuNames = []) {
  const seen = new Set();
  const out = [];
  for (const item of items || []) {
    for (const path of posScreenPaths(item, extraMenuNames)) {
      const key = path.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(path);
    }
  }
  return out.sort((a, b) => a.localeCompare(b));
}

/** Typed screen: Main, Main/Sub, or Main##Sub. Strips a leading menu name. */
export function parsePosScreenInput(raw) {
  const text = String(raw || "").trim();
  if (!text) return "";
  const parts = text.includes("##")
    ? text
        .split("##")
        .map((part) => part.trim())
        .filter(Boolean)
    : splitMenuScreenParts(text);
  const screenParts =
    parts.length && isLightspeedMenuName(parts[0]) ? parts.slice(1) : parts;
  return joinMenuScreenParts(screenParts);
}

/** Split `Gwenda/Spirits/Liqueurs & Amari,Gwenda/Soft Drinks` into path parts. */
export function parseMenuScreenList(raw) {
  const text = String(raw || "").trim();
  if (!text) return [];
  const paths = [];
  let buf = "";
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === "\\" && text[i + 1] === "/") {
      buf += "\\/";
      i += 1;
      continue;
    }
    if (text[i] === ",") {
      const parts = splitMenuScreenParts(buf);
      if (parts.length) paths.push(parts);
      buf = "";
      continue;
    }
    buf += text[i];
  }
  const last = splitMenuScreenParts(buf);
  if (last.length) paths.push(last);
  return paths;
}

function splitMenuScreenParts(path) {
  const out = [];
  let buf = "";
  for (let i = 0; i < path.length; i += 1) {
    if (path[i] === "\\" && path[i + 1] === "/") {
      buf += "/";
      i += 1;
      continue;
    }
    if (path[i] === "/") {
      if (buf) out.push(buf);
      buf = "";
      continue;
    }
    buf += path[i];
  }
  if (buf) out.push(buf);
  return out.map((part) => part.trim()).filter(Boolean);
}

function joinMenuScreenParts(parts) {
  return parts
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .map((part) => part.replaceAll("/", "\\/"))
    .join("/");
}

function defaultPriceFor(item) {
  const n = parseMoney(item?.price);
  return n == null ? "" : String(n);
}

/** One row of the official New items import sheet. Unused optional cells stay blank. */
function lightspeedTemplateCells({
  sku,
  name,
  price = "",
  group = "",
  menuScreen = "",
  buttonName,
  buttonColor = "BLUE",
  packageUnit = "",
}) {
  return [
    sku,
    name,
    "",
    "Item",
    "",
    "",
    price,
    "",
    group,
    "",
    "",
    menuScreen,
    buttonName ?? name,
    buttonColor,
    "",
    "",
    "LOCAL",
    "",
    "",
    packageUnit,
    "",
    "",
  ];
}

function itemImportCells(item, menuNames) {
  const name = item?.name || "";
  const menus = Array.isArray(menuNames) ? menuNames : [menuNames];
  return lightspeedTemplateCells({
    sku: assignedLightspeedSku(item),
    name,
    price: defaultPriceFor(item),
    group: accountingGroupForDrink(item),
    menuScreen: menuScreenPathForMenus(item, menus),
    buttonName: lightspeedButtonName(item),
  });
}

/**
 * One preview row matching the CSV: keys are the used import headers.
 * `_id` is for the export grid only.
 */
export function lightspeedImportPreviewRow(item, menuNames) {
  const cells = itemImportCells(item, menuNames);
  const row = {
    _id: String(item?._id || item?.id || assignedLightspeedSku(item)),
    _source: "menu",
  };
  for (const header of LIGHTSPEED_IMPORT_USED_HEADERS) {
    const index = LIGHTSPEED_IMPORT_HEADERS.indexOf(header);
    row[header] = index >= 0 ? (cells[index] ?? "") : "";
  }
  return row;
}

export function lightspeedImportPreviewRows(opsItems, menuNames) {
  return (opsItems || []).map((item) => lightspeedImportPreviewRow(item, menuNames));
}

function inventoryImportCells(item) {
  const name = item?.name || "";
  return lightspeedTemplateCells({
    sku: assignedLightspeedSku(item),
    name,
    price: "0",
    group: inventoryAccountingGroup(item),
    menuScreen: "",
    buttonName: name,
    buttonColor: "GRAY",
    packageUnit: lightspeedPackageUnit(item?.defaultUnit),
  });
}

/** Stable export grid id for an inventory row (avoids clashing with menu item ids). */
export function inventoryExportId(item) {
  const raw = String(item?._id || item?.id || "").trim();
  if (!raw) return `inv:${assignedLightspeedSku(item) || item?.name || ""}`;
  return raw.startsWith("inv:") ? raw : `inv:${raw}`;
}

export function parseInventoryExportId(raw) {
  const value = String(raw || "");
  return value.startsWith("inv:") ? value.slice(4) : "";
}

export function lightspeedInventoryPreviewRow(item) {
  const cells = inventoryImportCells(item);
  const row = {
    _id: inventoryExportId(item),
    _source: "inventory",
  };
  for (const header of LIGHTSPEED_COMBINED_IMPORT_HEADERS) {
    const index = LIGHTSPEED_IMPORT_HEADERS.indexOf(header);
    row[header] = index >= 0 ? (cells[index] ?? "") : "";
  }
  return row;
}

/**
 * Tag inventory rows so SKU allocation can run over drinks + stock together.
 */
export function withInventoryExportIds(inventory) {
  return (inventory || []).map((item) => ({
    ...item,
    _id: inventoryExportId(item),
    id: inventoryExportId(item),
  }));
}

/**
 * Stock that is not already a sellable drink under the same name.
 * Pours / packaged beers keep one Lightspeed Item (the menu row); Campari behind
 * Negroni still exports as inventory because the names differ.
 */
export function inventoryExclusiveForExport(menuItems, inventory) {
  const drinks = menuItems || [];
  return (inventory || []).filter((item) => {
    const name = String(item?.name || "").trim();
    if (!name) return false;
    return !drinks.some((drink) => {
      const drinkName = String(drink?.name || "").trim();
      if (!drinkName) return false;
      return (
        sameItemName(drinkName, name) ||
        sameItemName(serveBaseName(drinkName), name) ||
        sameItemName(serveBaseName(drinkName), serveBaseName(name))
      );
    });
  });
}

/**
 * Menu drinks + inventory stock as one File-import preview.
 * Inventory rows leave Menu/Screen blank and set Package unit.
 * Same-name stock behind a pour/beer is omitted (one Lightspeed Item).
 */
export function lightspeedCombinedImportPreviewRows(menuItems, inventory, menuNames) {
  const drinks = (menuItems || []).map((item) => {
    const row = lightspeedImportPreviewRow(item, menuNames);
    row["Package unit (stock mngmt)"] = "";
    return row;
  });
  const stock = inventoryExclusiveForExport(menuItems, inventory).map((item) =>
    lightspeedInventoryPreviewRow(item),
  );
  return [...drinks, ...stock];
}

/**
 * Item-import CSV with only columns we fill (official template subset).
 * `menuName` may be one name or several (Fall 2026 + Gwenda) so overlaps keep
 * buttons on every assigned menu.
 */
export function lightspeedItemImportCsv(opsItems, menuName) {
  const lines = [joinCsv(LIGHTSPEED_IMPORT_USED_HEADERS)];
  for (const item of opsItems || []) {
    const cells = itemImportCells(item, menuName);
    lines.push(
      joinCsv(
        LIGHTSPEED_IMPORT_USED_HEADERS.map((header) => {
          const index = LIGHTSPEED_IMPORT_HEADERS.indexOf(header);
          return index >= 0 ? (cells[index] ?? "") : "";
        }),
      ),
    );
  }
  return `${lines.join("\n")}\n`;
}

/**
 * Combined File import CSV: drinks and inventory in one sheet.
 * Same-name stock behind a menu drink is omitted.
 */
export function lightspeedCombinedItemImportCsv(menuItems, inventory, menuNames) {
  const lines = [joinCsv(LIGHTSPEED_COMBINED_IMPORT_HEADERS)];
  for (const item of menuItems || []) {
    const cells = itemImportCells(item, menuNames);
    lines.push(
      joinCsv(
        LIGHTSPEED_COMBINED_IMPORT_HEADERS.map((header) => {
          const index = LIGHTSPEED_IMPORT_HEADERS.indexOf(header);
          return index >= 0 ? (cells[index] ?? "") : "";
        }),
      ),
    );
  }
  for (const item of inventoryExclusiveForExport(menuItems, inventory)) {
    const cells = inventoryImportCells(item);
    lines.push(
      joinCsv(
        LIGHTSPEED_COMBINED_IMPORT_HEADERS.map((header) => {
          const index = LIGHTSPEED_IMPORT_HEADERS.indexOf(header);
          return index >= 0 ? (cells[index] ?? "") : "";
        }),
      ),
    );
  }
  return `${lines.join("\n")}\n`;
}

/**
 * Item list re-import using the same template. Menu/Screen is the selected POS
 * menu plus ops screens. Empty screens leave that column blank so Lightspeed
 * does not move the button.
 */
export function lightspeedItemUpdateCsv(opsItems, menuName) {
  return lightspeedItemImportCsv(opsItems, menuName);
}

function inventoryAccountingGroup(item) {
  const kind = String(item?.kind || "");
  if (kind === "beer") return "Beer";
  if (kind === "wine") return "Alcoholic Drinks";
  if (kind === "garnish") return "Food";
  if (kind === "juice" || kind === "mixer" || kind === "syrup") {
    return "Non-Alcoholic Drinks";
  }
  return "Alcoholic Drinks";
}

/**
 * Lightspeed Package unit only accepts mass / volume / %.
 * Ops recipe units (dash, pinch, sprig, each, drop) are left blank.
 * https://k-series-support.lightspeedhq.com/hc/en-us/articles/1260804656109
 */
export function lightspeedPackageUnit(unit) {
  const raw = String(unit || "").trim();
  if (!raw) return "";
  const key = raw.toLowerCase().replace(/\s+/g, " ");
  if (key === "ml" || key === "millilitre" || key === "milliliter") return "ml";
  if (key === "cl") return "cl";
  if (key === "dl") return "dl";
  if (key === "l" || key === "lt" || key === "ltr" || key === "litre" || key === "liter") {
    return "l";
  }
  if (key === "g" || key === "gram" || key === "grams") return "g";
  if (key === "kg") return "kg";
  if (key === "oz") return "oz";
  if (key === "fl oz" || key === "floz" || key === "fl. oz") return "fl oz";
  if (key === "lb" || key === "lbs") return "lb";
  if (key === "%") return "%";
  return "";
}

/**
 * Item-list rows for stock. No Menu/Screen: they decrement recipes, they are not buttons.
 * Composition (pint uses keg) is Back Office / Produce recipes, not this CSV.
 */
export function lightspeedInventoryItemCsv(inventory) {
  const lines = [joinCsv(LIGHTSPEED_INVENTORY_IMPORT_HEADERS)];
  for (const item of inventory || []) {
    const name = item?.name || "";
    if (!name) continue;
    const cells = inventoryImportCells(item);
    lines.push(
      joinCsv(
        LIGHTSPEED_INVENTORY_IMPORT_HEADERS.map((header) => {
          const index = LIGHTSPEED_IMPORT_HEADERS.indexOf(header);
          return index >= 0 ? (cells[index] ?? "") : "";
        }),
      ),
    );
  }
  return `${lines.join("\n")}\n`;
}

/** Menu management import: SKU + Screens for the chosen POS menu. */
export function lightspeedMenuLayoutCsv(opsItems, menuName) {
  const lines = [joinCsv(["SKU", "Screens"])];
  for (const item of opsItems || []) {
    const sku = assignedLightspeedSku(item);
    for (const screens of menuLayoutScreenRows(item, menuName)) {
      lines.push(joinCsv([sku, screens]));
    }
  }
  return `${lines.join("\n")}\n`;
}

/** SKUs on the Lightspeed file that are not ops drinks. For after-launch bulk archive. */
export function lightspeedArchiveSkuCsv(rows) {
  const lines = [joinCsv(["SKU", "Name", "Type"])];
  for (const row of rows || []) {
    const sku = String(row?.sku || "").trim();
    if (!sku) continue;
    lines.push(joinCsv([sku, row.name || "", row.type || ""]));
  }
  return `${lines.join("\n")}\n`;
}

export function patchesFromMatch(match) {
  const entries = [...(match?.matched || []), ...(match?.conflicts || [])];
  return entries.map((entry) => ({
    id: entry.ops?._id || entry.ops?.id,
    lightspeedSku: entry.lightspeed?.sku || entry.ops?.lightspeedSku,
    actualQty: entry.lightspeed?.quantity,
    actualUnit: entry.lightspeed?.unit || "",
  }));
}

export function menuPatchesFromMatch(match) {
  const matched = (match?.matched || []).map((entry) => ({
    id: entry.ops?._id || entry.ops?.id,
    lightspeedSku: entry.lightspeed?.sku || assignedLightspeedSku(entry.ops),
    lightspeedName:
      serveBaseName(entry.lightspeed?.buttonName) ||
      serveBaseName(entry.lightspeed?.name) ||
      "",
    lightspeedMenuScreen: serializePosScreens(
      posScreenPaths({ lightspeedMenuScreen: entry.lightspeed?.menuScreen }),
    ),
    lightspeedStatus: "matched",
  }));
  const conflicts = (match?.conflicts || []).map((entry) => ({
    id: entry.ops?._id || entry.ops?.id,
    lightspeedSku: entry.lightspeed?.sku || assignedLightspeedSku(entry.ops),
    lightspeedName:
      serveBaseName(entry.lightspeed?.buttonName) ||
      serveBaseName(entry.lightspeed?.name) ||
      "",
    lightspeedMenuScreen: serializePosScreens(
      posScreenPaths({ lightspeedMenuScreen: entry.lightspeed?.menuScreen }),
    ),
    lightspeedStatus: "mismatch",
  }));
  const opsOnly = (match?.opsOnly || []).map((item) => ({
    id: item?._id || item?.id,
    lightspeedStatus: "missing",
  }));
  return [...matched, ...conflicts, ...opsOnly];
}

function withLightspeedScreen(item, row) {
  const stored = String(item?.lightspeedMenuScreen || "").trim();
  const fromFile = serializePosScreens(
    posScreenPaths({ lightspeedMenuScreen: row?.menuScreen }),
  );
  return {
    ...item,
    lightspeedMenuScreen: stored || fromFile,
  };
}

function publicOps(item) {
  if (!item) return null;
  return {
    id: item._id || item.id,
    name: item.name,
    fullName: item.fullName,
    kind: item.kind,
    drinkType: item.drinkType,
    price: item.price,
    lightspeedSku: item.lightspeedSku,
    lightspeedName: item.lightspeedName,
    lightspeedMenuScreen: item.lightspeedMenuScreen,
    lightspeedStatus: item.lightspeedStatus,
    section: item.section,
    actualQty: item.actualQty,
    actualUnit: item.actualUnit,
    countedAt: item.countedAt,
    active: item.active !== false,
  };
}

function publicLs(row) {
  return {
    key: row.key,
    sku: row.sku,
    name: row.name,
    quantity: row.quantity,
    unit: row.unit,
    type: row.type,
    accountingGroup: row.accountingGroup,
    defaultPrice: row.defaultPrice,
    menuScreen: row.menuScreen,
    statisticsGroup: row.statisticsGroup,
    buttonName: row.buttonName,
    suggestedDrinkType: drinkTypeFromLightspeedRow(row),
    suggestedPrice: formatLightspeedPrice(row.defaultPrice),
    role: row.role || classifyLightspeedRow(row),
    packageContent: row.packageContent,
  };
}

export function summarizeMatch(
  result,
  menuName = DEFAULT_LIGHTSPEED_MENU,
  { archiveEntries } = {},
) {
  const opsOnly = result.opsOnly || [];
  const unused = result.unusedInventory || [];
  const splitMarked = partitionLightspeedOnly(
    result.lightspeedOnly || [],
    archiveEntries,
  );
  const split = pullUnusedInventoryLeftovers(splitMarked.pending, unused);
  const stockPartition = partitionLightspeedOnly(
    result.stockOnly || [],
    archiveEntries,
  );
  const stockSplit = pullUnusedInventoryLeftovers(stockPartition.pending, unused);
  const systemSplit = partitionLightspeedOnly(
    result.systemOnly || [],
    archiveEntries,
  );
  const linked = [
    ...(result.matched || []).map((entry) =>
      withLightspeedScreen(entry.ops, entry.lightspeed),
    ),
    ...(result.conflicts || []).map((entry) =>
      withLightspeedScreen(entry.ops, entry.lightspeed),
    ),
    ...opsOnly,
  ];
  return {
    matched: (result.matched || []).map((entry) => ({
      via: entry.via,
      ops: publicOps(entry.ops),
      lightspeed: publicLs(entry.lightspeed),
    })),
    conflicts: (result.conflicts || []).map((entry) => ({
      via: entry.via,
      ops: publicOps(entry.ops),
      lightspeed: publicLs(entry.lightspeed),
    })),
    altServes: (result.altServes || []).map((entry) => ({
      via: entry.via,
      ops: publicOps(entry.ops),
      lightspeed: publicLs(entry.lightspeed),
    })),
    lightspeedOnly: split.pending.map((row) => publicLs(row)),
    stockMatched: (result.stockMatched || []).map((entry) => ({
      via: entry.via,
      ops: publicOps(entry.ops),
      lightspeed: publicLs(entry.lightspeed),
    })),
    stockOnly: stockSplit.pending.map((row) => publicLs(row)),
    stockOpsOnly: (result.stockOpsOnly || []).map(publicOps),
    systemOnly: systemSplit.pending.map((row) => publicLs(row)),
    archive: [
      ...splitMarked.archive,
      ...stockPartition.archive,
      ...systemSplit.archive,
      ...split.extra,
      ...stockSplit.extra,
    ].map((row) => publicLs(row)),
    opsOnly: opsOnly.map(publicOps),
    itemImportCsv: lightspeedItemImportCsv(opsOnly, menuName),
    menuLayoutCsv: lightspeedMenuLayoutCsv(linked, menuName),
    archiveSkuCsv: lightspeedArchiveSkuCsv([
      ...splitMarked.archive,
      ...stockPartition.archive,
      ...systemSplit.archive,
      ...split.extra,
      ...stockSplit.extra,
    ]),
  };
}
