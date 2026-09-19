/**
 * Lightspeed K-Series CSV reconcile against ops Inventory.
 * Catalog lives in Baserow. Counts come from a Back Office export.
 */
import { parseQty } from "./inventory-store.js";
import { parseMoney } from "./suppliers.js";
import { itemSlug } from "./item-key.js";

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
};

export function parseCsvLine(line) {
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
    if (ch === "," || ch === ";") {
      out.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  out.push(current);
  return out;
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

export function parseLightspeedCsv(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .filter((line) => line.trim());
  if (lines.length < 2) return [];
  const headers = parseCsvLine(lines[0]);
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
    const cols = parseCsvLine(line);
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
    };
    const key = rowKey(row);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    rows.push({ ...row, key });
  }
  return rows;
}

function namesClash(ops, lsName) {
  const incoming = normalizeName(lsName);
  if (!incoming) return false;
  const opsName = normalizeName(ops.name);
  const opsFull = normalizeName(ops.fullName);
  if (!opsName && !opsFull) return false;
  return incoming !== opsName && incoming !== opsFull;
}

/**
 * Match Lightspeed rows to ops inventory.
 * SKU first (Lightspeed SKU on the catalog row), then exact name / full name.
 */
export function matchLightspeedRows(opsItems, lsRows) {
  const items = Array.isArray(opsItems) ? opsItems : [];
  const rows = Array.isArray(lsRows) ? lsRows : [];
  const bySku = new Map();
  const byName = new Map();
  for (const item of items) {
    const sku = String(item.lightspeedSku || "")
      .trim()
      .toUpperCase();
    if (sku && !bySku.has(sku)) bySku.set(sku, item);
    const names = [item.name, item.fullName].map(normalizeName).filter(Boolean);
    for (const name of names) {
      if (!byName.has(name)) byName.set(name, item);
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
      const name = normalizeName(row.name);
      item = name ? byName.get(name) : undefined;
      via = item ? "name" : "";
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
    if (via === "sku" && namesClash(item, row.name)) conflicts.push(entry);
    else matched.push(entry);
  }

  const opsOnly = items.filter((item) => !used.has(item._id || item.id));
  return { matched, conflicts, lightspeedOnly, opsOnly };
}

function csvEscape(value) {
  const raw = value == null ? "" : String(value);
  if (/[",\n]/.test(raw)) return `"${raw.replace(/"/g, '""')}"`;
  return raw;
}

export function assignedLightspeedSku(item) {
  const existing = String(item?.lightspeedSku || "")
    .trim()
    .toUpperCase();
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

function accountingGroupFor(item) {
  const kind = String(item?.kind || "").toLowerCase();
  if (kind === "liquor") return "Spirits";
  if (kind === "liqueur") return "Liqueurs";
  if (kind === "wine") return "Wine";
  if (kind === "beer") return "Beer";
  if (kind === "mixer" || kind === "juice" || kind === "syrup") return "Mixers";
  return "Bar stock";
}

function costFor(item) {
  const priced = (item?.suppliers || []).find(
    (entry) => typeof entry.price === "number" && Number.isFinite(entry.price),
  );
  if (priced) return priced.price;
  if (typeof item?.estimatedCost === "number") return item.estimatedCost;
  return "";
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

/** Lightspeed item-import CSV for ops catalog rows missing in POS. */
export function lightspeedItemImportCsv(opsItems) {
  const header = [
    "SKU",
    "Accounting group",
    "Type",
    "Name",
    "Cost price",
    "Package unit",
  ];
  const lines = [header.join(",")];
  for (const item of opsItems || []) {
    if (item.active === false) continue;
    lines.push(
      [
        csvEscape(assignedLightspeedSku(item)),
        csvEscape(accountingGroupFor(item)),
        "Item",
        csvEscape(item.name || ""),
        csvEscape(costFor(item)),
        csvEscape(item.defaultUnit || ""),
      ].join(","),
    );
  }
  return `${lines.join("\n")}\n`;
}

export function canCreateFromLightspeed(row) {
  const type = String(row?.type || "")
    .trim()
    .toLowerCase();
  if (!type) return true;
  return type === "item";
}

function publicOps(item) {
  if (!item) return null;
  return {
    id: item._id || item.id,
    name: item.name,
    fullName: item.fullName,
    kind: item.kind,
    lightspeedSku: item.lightspeedSku,
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
  };
}

export function summarizeMatch(result) {
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
    lightspeedOnly: (result.lightspeedOnly || []).map((row) => ({
      ...publicLs(row),
      canCreate: canCreateFromLightspeed(row),
    })),
    opsOnly: (result.opsOnly || []).map(publicOps),
  };
}
