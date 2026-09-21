/**
 * Lightspeed K-Series item-library CSV against ops Menu Items (what we sell).
 * Inventory / stock-level files are a later ingest.
 */
import { parseMoney } from "./suppliers.js";
import { itemSlug, namesClash as sameItemName } from "./item-key.js";
import { flattenMenuSections, sectionPathLabel } from "./menu-sections.js";

export const DEFAULT_LIGHTSPEED_MENU = "Gwenda Next";

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

export const LIGHTSPEED_STATUSES = ["matched", "mismatch", "missing"];

/** In-place Item list updates. No Menu/Screen, so a re-import does not move buttons. */
export const LIGHTSPEED_UPDATE_HEADERS = [
  "SKU",
  "Name",
  "Type",
  "Default price",
  "Accounting group",
  "Button name",
  "Sharing status",
];

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
  unit: ["package unit", "unit", "uom", "content uom"],
  type: ["type", "item type"],
  accountingGroup: ["accounting group", "accountinggroup"],
  costPrice: ["cost price", "cost"],
  packageContent: ["package content", "content value"],
  defaultPrice: ["default price", "price"],
  menuScreen: ["menu screen", "menu", "screen"],
  statisticsGroup: ["statistics group"],
  buttonName: ["button name"],
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

/**
 * Match Lightspeed rows to ops catalog rows.
 * SKU first, then exact name, then slug (St-Germain / St Germain), then button name.
 */
export function matchLightspeedRows(opsItems, lsRows) {
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
    if (item && used.has(item._id || item.id)) {
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
      !sameNameIdentity(item, row.name)
    ) {
      conflicts.push(entry);
    } else {
      matched.push(entry);
    }
  }

  const opsOnly = items.filter((item) => !used.has(item._id || item.id));
  return { matched, conflicts, lightspeedOnly, opsOnly };
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
      lightspeedName: row.name || "",
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
  if (raw.includes('"') || raw.includes("\n") || raw.includes(sep)) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
}

function joinCsv(values, sep = ";") {
  return values.map((value) => csvEscape(value, sep)).join(sep);
}

export function assignedLightspeedSku(item) {
  const existing = storedLightspeedSku(item);
  if (existing) return existing;
  const slug = itemSlug(item?.name || "")
    .replace(/[^a-z0-9]+/gi, "")
    .toUpperCase()
    .slice(0, 16);
  const id = String(item?._id || item?.id || "")
    .replace(/\D/g, "")
    .slice(-6);
  return `GW${slug || "ITEM"}${id}`;
}

export function storedLightspeedSku(item) {
  return String(item?.lightspeedSku || "")
    .trim()
    .toUpperCase();
}

/** Flat ops drinks from the nested section tree, with section labels for screens. */
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
  return out.sort((a, b) => {
    const path =
      sectionPathLabel(a.section).localeCompare(sectionPathLabel(b.section)) ||
      String(a.name || "").localeCompare(String(b.name || ""));
    return path;
  });
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
  if (kind === "packaged") return "Non-Alcoholic Drinks";
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
  if (
    group.includes("non-alcoholic") ||
    group.includes("soft") ||
    group.includes("food")
  ) {
    return "packaged";
  }
  if (group.includes("alcoholic")) return "pour";
  const screen = normalizeName(row?.menuScreen);
  if (screen.includes("cocktail")) return "cocktail";
  if (screen.includes("beer")) return "beer";
  if (screen.includes("soft") || screen.includes("non-alcoholic")) return "packaged";
  const stats = normalizeName(row?.statisticsGroup);
  if (stats.includes("cocktail")) return "cocktail";
  if (stats.includes("beer")) return "beer";
  if (stats.includes("soft")) return "packaged";
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
    lightspeedSku: sku,
    lightspeedName: name,
    lightspeedStatus: "matched",
    onPrintMenu: input?.onPrintMenu === true,
    onDigitalMenu: input?.onDigitalMenu === true,
  };
}

export function menuScreenPath(item, menuName) {
  const menu = String(menuName || "").trim() || DEFAULT_LIGHTSPEED_MENU;
  const parent = String(item?.section?.parentTitle || "").trim();
  const title = String(item?.section?.title || "").trim();
  const parts = [menu];
  if (parent) parts.push(parent);
  if (title) parts.push(title);
  return parts.join("/");
}

export function menuLayoutScreens(item) {
  const parent = String(item?.section?.parentTitle || "").trim();
  const title = String(item?.section?.title || "").trim();
  if (parent && title) return `${parent}##${title}`;
  return title || parent || "Uncategorised";
}

function defaultPriceFor(item) {
  const n = parseMoney(item?.price);
  return n == null ? "" : String(n);
}

function itemImportCells(item, menuName) {
  const name = item?.name || "";
  return [
    assignedLightspeedSku(item),
    name,
    "",
    "",
    "Item",
    defaultPriceFor(item),
    "",
    accountingGroupForDrink(item),
    menuScreenPath(item, menuName),
    name,
    "BLUE",
    "Accent",
    "",
    "",
    "",
    "",
    "",
    "",
    "LOCAL",
    "",
    "",
    "",
    "",
  ];
}

/** Lightspeed formatted item-import CSV (semicolon), same headers as the Back Office export. */
export function lightspeedItemImportCsv(opsItems, menuName) {
  const lines = [joinCsv(LIGHTSPEED_ITEM_HEADERS)];
  for (const item of opsItems || []) {
    lines.push(joinCsv(itemImportCells(item, menuName)));
  }
  return `${lines.join("\n")}\n`;
}

/**
 * Item list re-import for in-place name/price/group edits.
 * Omits Menu/Screen so mapping that column cannot move POS buttons.
 */
export function lightspeedItemUpdateCsv(opsItems) {
  const lines = [joinCsv(LIGHTSPEED_UPDATE_HEADERS)];
  for (const item of opsItems || []) {
    const name = item?.name || "";
    lines.push(
      joinCsv([
        assignedLightspeedSku(item),
        name,
        "Item",
        defaultPriceFor(item),
        accountingGroupForDrink(item),
        name,
        "LOCAL",
      ]),
    );
  }
  return `${lines.join("\n")}\n`;
}

/** Menu management import: SKU + Screens for every ops drink on the new menu. */
export function lightspeedMenuLayoutCsv(opsItems) {
  const lines = [joinCsv(["SKU", "Screens"])];
  for (const item of opsItems || []) {
    lines.push(joinCsv([assignedLightspeedSku(item), menuLayoutScreens(item)]));
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
    lightspeedName: entry.lightspeed?.name || "",
    lightspeedStatus: "matched",
  }));
  const conflicts = (match?.conflicts || []).map((entry) => ({
    id: entry.ops?._id || entry.ops?.id,
    lightspeedSku: entry.lightspeed?.sku || assignedLightspeedSku(entry.ops),
    lightspeedName: entry.lightspeed?.name || "",
    lightspeedStatus: "mismatch",
  }));
  const opsOnly = (match?.opsOnly || []).map((item) => ({
    id: item?._id || item?.id,
    lightspeedStatus: "missing",
  }));
  return [...matched, ...conflicts, ...opsOnly];
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
  };
}

export function summarizeMatch(
  result,
  menuName = DEFAULT_LIGHTSPEED_MENU,
  { archiveEntries } = {},
) {
  const opsOnly = result.opsOnly || [];
  const split = partitionLightspeedOnly(result.lightspeedOnly || [], archiveEntries);
  const linked = [
    ...(result.matched || []).map((entry) => entry.ops),
    ...(result.conflicts || []).map((entry) => entry.ops),
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
    lightspeedOnly: split.pending.map((row) => publicLs(row)),
    archive: split.archive.map((row) => publicLs(row)),
    opsOnly: opsOnly.map(publicOps),
    itemImportCsv: lightspeedItemImportCsv(opsOnly, menuName),
    menuLayoutCsv: lightspeedMenuLayoutCsv(linked),
    archiveSkuCsv: lightspeedArchiveSkuCsv(split.archive),
  };
}
