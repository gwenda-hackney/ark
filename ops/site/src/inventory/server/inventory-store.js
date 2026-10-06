/**
 * Bar stock, suppliers and which supplier sells what, stored through the
 * MenuRepository (collections inventory, suppliers, inventory_suppliers).
 */
import { menuRepository } from "../../menu/server/menu-repository.js";
import { recomputeDrinksForInventoryId } from "../../menu/server/menu-store.js";
import { normalizeUnit } from "../../menu/server/menu.js";
import {
  findSupplierNameClash,
  looksLikeOnlyUrls,
  normalizeSupplierEntries,
  parseMoney,
  skuFromProductUrl,
  supplierFromUrl,
} from "../suppliers.js";
import { normalizeWebsite, parseProductUrl } from "../../../../../shared/web-address.js";
import { assertUniqueItemName } from "../../menu/item-key.js";

function text(value) {
  if (typeof value !== "string") return "";
  return value.trim();
}

function selectValueLocal(value) {
  if (typeof value === "string") return value.trim();
  if (value && typeof value === "object" && typeof value.value === "string") {
    return value.value.trim();
  }
  return "";
}

const KINDS = new Set([
  "liquor",
  "liqueur",
  "wine",
  "beer",
  "syrup",
  "juice",
  "bitter",
  "mixer",
  "garnish",
  "other",
]);

export function normalizeInventoryKind(value) {
  const raw = selectValueLocal(value).toLowerCase();
  if (KINDS.has(raw)) return raw;
  return "other";
}

function kindFromLightspeedRow(row) {
  const name = String(row?.name || "").toLowerCase();
  const group = String(row?.accountingGroup || "").toLowerCase();
  const stats = String(row?.statisticsGroup || "").toLowerCase();
  if (/\bkeg\b/.test(name) || group.includes("beer")) return "beer";
  if (group === "food") return "garnish";
  if (stats.includes("ingredients") && /bitter/.test(name)) return "bitter";
  if (stats.includes("ingredients") && /syrup|cordial/.test(name)) return "syrup";
  if (stats.includes("ingredients") && /juice/.test(name)) return "juice";
  if (group.includes("wine")) return "wine";
  if (group.includes("non-alcoholic")) return "mixer";
  if (group.includes("alcoholic")) return "liquor";
  return "other";
}

/** A suppliers record → the supplier ops shows. */
export function mapSupplier(record) {
  return {
    _id: String(record.id),
    id: String(record.id),
    name: text(record.name),
    website: parseProductUrl(record.website) || undefined,
    notes: text(record.notes) || undefined,
  };
}

/** An inventory record → the stock item ops shows. */
export function mapInventoryItem(record, suppliers = []) {
  const notesRaw = text(record.notes);
  const notes =
    suppliers.length > 0 && looksLikeOnlyUrls(notesRaw)
      ? undefined
      : notesRaw || undefined;
  const actualQty = parseQty(record.actualQty);
  const countedAt = text(record.countedAt);

  return {
    _id: String(record.id),
    id: String(record.id),
    name: text(record.name),
    fullName: text(record.fullName) || undefined,
    kind: normalizeInventoryKind(record.kind),
    abv: text(record.abv) || undefined,
    defaultUnit: text(record.defaultUnit) || undefined,
    estimatedCost: parseMoney(record.estimatedCost) ?? undefined,
    suppliers,
    notes,
    active: record.active !== false,
    lightspeedSku: text(record.lightspeedSku) || undefined,
    ...(actualQty != null ? { actualQty } : {}),
    actualUnit: text(record.actualUnit) || undefined,
    ...(countedAt ? { countedAt } : {}),
  };
}

export function parseQty(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const raw = String(value ?? "")
    .trim()
    .replace(/,/g, "");
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function idText(value) {
  return value == null ? "" : String(value);
}

function mapLinkedSupplier(record, suppliersById) {
  const supplierId = idText(record.supplierId);
  const inventoryId = idText(record.inventoryId);
  const supplier = supplierId ? suppliersById.get(supplierId) : null;
  const productUrl = parseProductUrl(record.productUrl);
  const name = supplier?.name || text(record.name);
  if (!inventoryId || (!name && !productUrl)) return null;
  const sku = text(record.sku) || skuFromProductUrl(productUrl);
  const pack = text(record.pack);
  const price = parseMoney(record.price);
  return {
    _id: String(record.id),
    inventoryId,
    ...(supplierId ? { supplierId } : {}),
    name,
    ...(productUrl ? { productUrl } : {}),
    ...(sku ? { sku } : {}),
    ...(pack ? { pack } : {}),
    ...(price != null ? { price } : {}),
  };
}

function supplierIndex(records) {
  const byId = new Map();
  const byName = new Map();
  for (const record of records) {
    const mapped = mapSupplier(record);
    byId.set(mapped._id, mapped);
    if (mapped.name) byName.set(mapped.name.toLowerCase(), mapped);
  }
  return { byId, byName };
}

async function loadSupplierIndex(repo) {
  return supplierIndex(await repo.list("suppliers"));
}

function remember(index, record) {
  const mapped = mapSupplier(record);
  index.byId.set(mapped._id, mapped);
  index.byName.set(mapped.name.toLowerCase(), mapped);
  return mapped;
}

async function findOrCreateSupplier(repo, index, entry) {
  const supplierId = text(String(entry.supplierId ?? ""));
  if (supplierId && index.byId.has(supplierId)) return index.byId.get(supplierId);

  let name = text(entry.name);
  let website = parseProductUrl(entry.website);
  if (!name && entry.productUrl) {
    const inferred = supplierFromUrl(entry.productUrl);
    name = inferred?.name || "";
    website = website || inferred?.website || "";
  }
  if (!name) return null;

  const hit = index.byName.get(name.toLowerCase());
  if (hit) {
    if (website && !hit.website) {
      return remember(index, await repo.update("suppliers", hit._id, { website }));
    }
    return hit;
  }

  return remember(index, await repo.create("suppliers", { name, website: website || "", notes: "" }));
}

/** Prefer SKU so slug-only URL differences do not create duplicate links. */
function linkKey(supplierId, productUrl, sku = "") {
  const code = text(sku).toUpperCase() || skuFromProductUrl(productUrl);
  if (code) return `${supplierId}|sku:${code}`;
  return `${supplierId}|url:${parseProductUrl(productUrl).toLowerCase()}`;
}

/** The inventory_suppliers fields linking stock `inventoryId` to `supplier`. */
function linkFields(inventoryId, supplier, entry) {
  const productUrl = parseProductUrl(entry.productUrl);
  const sku = text(entry.sku) || skuFromProductUrl(productUrl);
  const pack = text(entry.pack);
  const price = parseMoney(entry.price);
  return {
    name: supplier.name,
    inventoryId: Number(inventoryId),
    supplierId: Number(supplier._id),
    productUrl: productUrl || "",
    sku,
    pack,
    price,
  };
}

function linkMetaChanged(record, fields) {
  return (
    parseProductUrl(record.productUrl) !== parseProductUrl(fields.productUrl) ||
    text(record.sku) !== text(fields.sku) ||
    text(record.pack) !== text(fields.pack) ||
    parseMoney(record.price) !== parseMoney(fields.price)
  );
}

/**
 * Store stock `inventoryId`'s supplier links as `entries`: links already
 * there are kept or updated, the rest created, and leftovers (and repeats)
 * removed, in one repository write. New suppliers are created as needed.
 */
async function replaceInventorySuppliers(repo, inventoryId, entries, index) {
  const existing = await repo.list("inventory_suppliers", { inventoryId });
  const existingByKey = new Map();
  const duplicateIds = new Set();
  for (const record of existing) {
    const mapped = mapLinkedSupplier(record, index.byId);
    if (!mapped?.supplierId) {
      duplicateIds.add(record.id);
      continue;
    }
    const key = linkKey(mapped.supplierId, mapped.productUrl, mapped.sku);
    if (existingByKey.has(key)) {
      duplicateIds.add(record.id);
      continue;
    }
    existingByKey.set(key, record);
  }

  const keep = new Set();
  const changes = [];
  const slots = [];
  for (const entry of normalizeSupplierEntries(entries)) {
    const supplier = await findOrCreateSupplier(repo, index, entry);
    if (!supplier) continue;
    const productUrl = parseProductUrl(entry.productUrl);
    const sku = text(entry.sku) || skuFromProductUrl(productUrl);
    const key = linkKey(supplier._id, productUrl, sku);
    keep.add(key);
    const fields = linkFields(inventoryId, supplier, entry);
    const current = existingByKey.get(key);
    if (current && !linkMetaChanged(current, fields)) {
      slots.push({ record: current });
      continue;
    }
    slots.push({ change: changes.length });
    changes.push(
      current
        ? { op: "update", collection: "inventory_suppliers", id: current.id, fields }
        : { op: "create", collection: "inventory_suppliers", fields },
    );
  }
  for (const record of existing) {
    const mapped = mapLinkedSupplier(record, index.byId);
    if (
      duplicateIds.has(record.id) ||
      !mapped?.supplierId ||
      !keep.has(linkKey(mapped.supplierId, mapped.productUrl, mapped.sku))
    ) {
      changes.push({ op: "remove", collection: "inventory_suppliers", id: record.id });
    }
  }

  const written = await repo.write(changes);
  return slots
    .map((slot) => mapLinkedSupplier(slot.record ?? written[slot.change], index.byId))
    .filter(Boolean);
}

function attachSuppliers(items, linkRecords, suppliersById) {
  const byInventory = new Map();
  for (const record of linkRecords) {
    const mapped = mapLinkedSupplier(record, suppliersById);
    if (!mapped) continue;
    const list = byInventory.get(mapped.inventoryId) ?? [];
    list.push({
      _id: mapped._id,
      supplierId: mapped.supplierId,
      name: mapped.name,
      ...(mapped.productUrl ? { productUrl: mapped.productUrl } : {}),
      ...(mapped.sku ? { sku: mapped.sku } : {}),
      ...(mapped.pack ? { pack: mapped.pack } : {}),
      ...(mapped.price != null ? { price: mapped.price } : {}),
    });
    byInventory.set(mapped.inventoryId, list);
  }
  return items.map((item) => {
    const suppliers = byInventory.get(item._id) || [];
    const notes =
      suppliers.length > 0 && looksLikeOnlyUrls(item.notes)
        ? undefined
        : item.notes;
    return { ...item, suppliers, notes };
  });
}

export async function listInventory(env, { includeInactive = false } = {}) {
  const repo = menuRepository(env);
  const [inventory, suppliers, links] = await Promise.all([
    repo.list("inventory"),
    repo.list("suppliers"),
    repo.list("inventory_suppliers"),
  ]);
  const { byId } = supplierIndex(suppliers);
  return attachSuppliers(
    inventory.map((record) => mapInventoryItem(record)),
    links,
    byId,
  )
    .filter((item) => includeInactive || item.active !== false)
    .sort((a, b) =>
      String(a.name || "").localeCompare(String(b.name || ""), undefined, {
        sensitivity: "base",
      }),
    );
}

/** The inventory fields a save writes. */
function fieldsFromInput(input) {
  const name = text(input.name);
  if (!name) {
    const error = new Error("Name is required.");
    error.status = 400;
    throw error;
  }
  const abv = text(String(input.abv ?? "")).replace(/%/g, "");
  const notes = text(input.notes);

  const qty = parseQty(input.actualQty);
  const actualUnit = text(input.actualUnit);

  return {
    name,
    fullName: text(input.fullName),
    kind: normalizeInventoryKind(input.kind),
    abv,
    defaultUnit: text(input.defaultUnit),
    estimatedCost: parseMoney(input.estimatedCost),
    notes,
    active:
      input.active == null
        ? true
        : input.active === true || input.active === "true",
    actualQty: qty,
    actualUnit,
  };
}

function entriesFromInput(input) {
  if (input.suppliers !== undefined) return normalizeSupplierEntries(input.suppliers);
  if (input.supplierLinks !== undefined) {
    return normalizeSupplierEntries(input.supplierLinks);
  }
  return undefined;
}

function siblingNames(records) {
  return records.map((record) => ({ id: record.id, name: text(record.name) }));
}

export async function createInventoryItem(env, input) {
  const repo = menuRepository(env);
  const fields = fieldsFromInput(input);
  if (fields.actualQty != null) {
    fields.countedAt = new Date().toISOString();
  }
  assertUniqueItemName(siblingNames(await repo.list("inventory")), fields.name);
  const record = await repo.create("inventory", fields);
  const index = await loadSupplierIndex(repo);
  const suppliers = await replaceInventorySuppliers(
    repo,
    record.id,
    entriesFromInput(input) || [],
    index,
  );
  return mapInventoryItem(record, suppliers);
}

export async function updateInventoryItem(env, itemId, input) {
  const repo = menuRepository(env);
  const existing = await repo.get("inventory", itemId);
  if (!existing) {
    const error = new Error("Inventory item not found.");
    error.status = 404;
    throw error;
  }
  const mapped = mapInventoryItem(existing);
  const prevAbv = text(String(mapped.abv ?? "")).replace(/%/g, "");
  const fields = fieldsFromInput({
      name: input.name ?? mapped.name,
      fullName: input.fullName !== undefined ? input.fullName : mapped.fullName,
      kind: input.kind ?? mapped.kind,
      abv: input.abv ?? mapped.abv,
      defaultUnit: input.defaultUnit ?? mapped.defaultUnit,
      estimatedCost:
        input.estimatedCost !== undefined
          ? input.estimatedCost
          : mapped.estimatedCost,
      notes: input.notes !== undefined ? input.notes : mapped.notes,
      active: input.active ?? mapped.active,
      actualQty: input.actualQty !== undefined ? input.actualQty : mapped.actualQty,
      actualUnit:
        input.actualUnit !== undefined ? input.actualUnit : mapped.actualUnit,
    });
  if (fields.actualQty !== (mapped.actualQty ?? null) ||
      text(fields.actualUnit) !== text(mapped.actualUnit)) {
    fields.countedAt =
      fields.actualQty == null ? "" : new Date().toISOString();
  }
  assertUniqueItemName(siblingNames(await repo.list("inventory")), fields.name, { exceptId: itemId });
  const record = await repo.update("inventory", itemId, fields);
  const index = await loadSupplierIndex(repo);
  const nextEntries = entriesFromInput(input);
  const suppliers =
    nextEntries !== undefined
      ? await replaceInventorySuppliers(repo, itemId, nextEntries, index)
      : attachSuppliers(
          [mapped],
          await repo.list("inventory_suppliers", { inventoryId: itemId }),
          index.byId,
        )[0].suppliers;
  const next = mapInventoryItem(record, suppliers);
  const nextAbv = text(String(next.abv ?? "")).replace(/%/g, "");
  if (prevAbv !== nextAbv) {
    await recomputeDrinksForInventoryId(env, itemId, { previousAbv: prevAbv });
  }
  return next;
}

/** Removes the stock item and its supplier links; recipe lines keep their name. */
export async function deleteInventoryItem(env, itemId) {
  const repo = menuRepository(env);
  if (!(await repo.get("inventory", itemId))) {
    const error = new Error("Inventory item not found.");
    error.status = 404;
    throw error;
  }
  await repo.remove("inventory", itemId);
  return { ok: true };
}

function lightspeedFieldsFromPatch(patch, countedAt) {
  const sku = text(patch.lightspeedSku);
  const qty = parseQty(patch.actualQty);
  const unit = text(patch.actualUnit);
  const fields = {};
  if (sku) fields.lightspeedSku = sku;
  if (qty != null) {
    fields.actualQty = qty;
    fields.actualUnit = unit;
    if (countedAt) fields.countedAt = countedAt;
  } else if (unit) {
    fields.actualUnit = unit;
  }
  return fields;
}

/** Write Lightspeed SKU and counted quantity without touching catalog fields, in one write. */
export async function applyLightspeedActual(env, patches, countedAt) {
  const stamp = countedAt || new Date().toISOString();
  const changes = [];
  for (const patch of patches || []) {
    const id = text(String(patch.id ?? patch._id ?? ""));
    if (!id) continue;
    const fields = lightspeedFieldsFromPatch(patch, stamp);
    if (!Object.keys(fields).length) continue;
    changes.push({ op: "update", collection: "inventory", id, fields });
  }
  return (await menuRepository(env).write(changes)).map((record) => mapInventoryItem(record));
}

/** Explicit create from an unmatched Lightspeed Item row. */
export async function createInventoryFromLightspeed(env, row, countedAt) {
  const repo = menuRepository(env);
  const name = text(row.name);
  if (!name) {
    const error = new Error("Name is required.");
    error.status = 400;
    throw error;
  }
  const siblings = siblingNames(await repo.list("inventory"));
  let unique = name;
  try {
    assertUniqueItemName(siblings, unique);
  } catch (error) {
    if (error.status !== 409) throw error;
    const sku = text(row.sku);
    unique = sku ? `${name} (${sku})` : `${name} (Lightspeed)`;
    assertUniqueItemName(siblings, unique);
  }
  const stamp = countedAt || new Date().toISOString();
  const unit = text(row.unit);
  const defaultUnit = normalizeUnit(unit);
  const fields = {
    name: unique,
    kind: kindFromLightspeedRow(row),
    active: true,
    ...lightspeedFieldsFromPatch(
      {
        lightspeedSku: row.sku,
        actualQty: row.quantity,
        actualUnit: unit,
      },
      stamp,
    ),
  };
  if (defaultUnit) fields.defaultUnit = defaultUnit;
  return mapInventoryItem(await repo.create("inventory", fields), []);
}

function supplierFieldsFromInput(input, { partial = false } = {}) {
  const fields = {};
  if (!partial || input.name !== undefined) {
    const name = text(input.name);
    if (!name) {
      const error = new Error("Name is required.");
      error.status = 400;
      throw error;
    }
    fields.name = name;
  }
  if (!partial || input.website !== undefined) {
    const raw = text(input.website);
    const website = normalizeWebsite(raw);
    if (raw && !website) {
      const error = new Error("Enter a website URL.");
      error.status = 400;
      throw error;
    }
    fields.website = website;
  }
  if (!partial || input.notes !== undefined) {
    fields.notes = text(input.notes);
  }
  return fields;
}

export async function listSuppliers(env) {
  const repo = menuRepository(env);
  const [suppliers, links] = await Promise.all([
    repo.list("suppliers"),
    repo.list("inventory_suppliers"),
  ]);
  const counts = new Map();
  for (const link of links) {
    if (link.supplierId == null) continue;
    const key = String(link.supplierId);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return suppliers
    .map(mapSupplier)
    .filter((row) => row.name)
    .map((row) => ({
      ...row,
      itemCount: counts.get(row.id) || 0,
    }))
    .sort((a, b) =>
      String(a.name || "").localeCompare(String(b.name || ""), undefined, {
        sensitivity: "base",
      }),
    );
}

function nameClash(records, name, exceptId) {
  return findSupplierNameClash(siblingNames(records), name, exceptId ? { exceptId } : undefined);
}

export async function createSupplier(env, input) {
  const repo = menuRepository(env);
  const fields = supplierFieldsFromInput(input || {});
  if (nameClash(await repo.list("suppliers"), fields.name)) {
    const error = new Error("A supplier with that name already exists.");
    error.status = 409;
    throw error;
  }
  return { ...mapSupplier(await repo.create("suppliers", fields)), itemCount: 0 };
}

async function existingSupplier(repo, supplierId) {
  const id = text(String(supplierId || ""));
  if (!id) {
    const error = new Error("Missing id.");
    error.status = 400;
    throw error;
  }
  if (!(await repo.get("suppliers", id))) {
    const error = new Error("Supplier not found.");
    error.status = 404;
    throw error;
  }
  return id;
}

export async function updateSupplier(env, supplierId, input) {
  const repo = menuRepository(env);
  const id = await existingSupplier(repo, supplierId);
  const fields = supplierFieldsFromInput(input || {}, { partial: true });
  if (fields.name && nameClash(await repo.list("suppliers"), fields.name, id)) {
    const error = new Error("A supplier with that name already exists.");
    error.status = 409;
    throw error;
  }
  const record = await repo.update("suppliers", id, fields);
  const links = await repo.list("inventory_suppliers", { supplierId: id });
  return { ...mapSupplier(record), itemCount: links.length };
}

export async function deleteSupplier(env, supplierId) {
  const repo = menuRepository(env);
  const id = await existingSupplier(repo, supplierId);
  const links = await repo.list("inventory_suppliers", { supplierId: id });
  if (links.length) {
    const error = new Error(
      links.length === 1
        ? "This supplier is used on 1 inventory item. Remove that link first."
        : `This supplier is used on ${links.length} inventory items. Remove those links first.`,
    );
    error.status = 409;
    throw error;
  }
  await repo.remove("suppliers", id);
  return { ok: true };
}
