import {
  createRow,
  deleteRow,
  deleteRowsInOrder,
  getRow,
  linkHasQuery,
  linkValue,
  listAllRows,
  resolveOpsTableIds,
  updateRow,
} from "../../../../../shared/baserow.js";
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

export function mapSupplier(row) {
  return {
    _id: String(row.id),
    id: String(row.id),
    name: text(row.Name),
    website: parseProductUrl(row.Website) || undefined,
    notes: text(row.Notes) || undefined,
  };
}

export function mapInventoryItem(row, suppliers = []) {
  const notesRaw = text(row.Notes);
  const notes =
    suppliers.length > 0 && looksLikeOnlyUrls(notesRaw)
      ? undefined
      : notesRaw || undefined;
  const actualQty = parseQty(row["Actual qty"]);
  const countedAt = dateText(row["Counted at"]);

  return {
    _id: String(row.id),
    id: String(row.id),
    name: text(row.Name),
    fullName: text(row["Full name"]) || undefined,
    kind: normalizeInventoryKind(row.Kind),
    abv: text(row.ABV) || undefined,
    defaultUnit: selectValueLocal(row["Default unit"]) || undefined,
    estimatedCost: parseMoney(row["Estimated cost"]) ?? undefined,
    suppliers,
    notes,
    active: row.Active == null ? true : Boolean(row.Active),
    lightspeedSku: text(row["Lightspeed SKU"]) || undefined,
    ...(actualQty != null ? { actualQty } : {}),
    actualUnit: text(row["Actual unit"]) || undefined,
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

function dateText(value) {
  if (!value) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "object" && value.value) return String(value.value).trim();
  return "";
}

function mapLinkedSupplier(row, suppliersById) {
  const supplierId =
    linkValue(row.Supplier) != null ? String(linkValue(row.Supplier)) : "";
  const inventoryId =
    linkValue(row.Inventory) != null ? String(linkValue(row.Inventory)) : "";
  const supplier = supplierId ? suppliersById.get(supplierId) : null;
  const productUrl = parseProductUrl(row["Product URL"]);
  const name = supplier?.name || text(row.Name);
  if (!inventoryId || (!name && !productUrl)) return null;
  const sku = text(row.SKU) || skuFromProductUrl(productUrl);
  const pack = text(row.Pack);
  const price = parseMoney(row.Price);
  return {
    _id: String(row.id),
    inventoryId,
    ...(supplierId ? { supplierId } : {}),
    name,
    ...(productUrl ? { productUrl } : {}),
    ...(sku ? { sku } : {}),
    ...(pack ? { pack } : {}),
    ...(price != null ? { price } : {}),
  };
}

function supplierIndex(rows) {
  const byId = new Map();
  const byName = new Map();
  for (const row of rows) {
    const mapped = mapSupplier(row);
    byId.set(mapped._id, mapped);
    if (mapped.name) byName.set(mapped.name.toLowerCase(), mapped);
  }
  return { byId, byName };
}

async function loadSupplierIndex(env, tables) {
  if (!tables.suppliers) return { byId: new Map(), byName: new Map() };
  const rows = await listAllRows(env, tables.suppliers);
  return supplierIndex(rows);
}

async function findOrCreateSupplier(env, tables, index, entry) {
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
      const row = await updateRow(env, tables.suppliers, hit._id, {
        Website: website,
      });
      const mapped = mapSupplier(row);
      index.byId.set(mapped._id, mapped);
      index.byName.set(mapped.name.toLowerCase(), mapped);
      return mapped;
    }
    return hit;
  }

  const row = await createRow(env, tables.suppliers, {
    Name: name,
    Website: website || "",
    Notes: "",
  });
  const mapped = mapSupplier(row);
  index.byId.set(mapped._id, mapped);
  index.byName.set(mapped.name.toLowerCase(), mapped);
  return mapped;
}

/** Prefer SKU so slug-only URL differences do not create duplicate links. */
function linkKey(supplierId, productUrl, sku = "") {
  const code = text(sku).toUpperCase() || skuFromProductUrl(productUrl);
  if (code) return `${supplierId}|sku:${code}`;
  return `${supplierId}|url:${parseProductUrl(productUrl).toLowerCase()}`;
}

function junctionFields(inventoryId, supplier, entry) {
  const productUrl = parseProductUrl(entry.productUrl);
  const sku = text(entry.sku) || skuFromProductUrl(productUrl);
  const pack = text(entry.pack);
  const price = parseMoney(entry.price);
  return {
    Name: supplier.name,
    Inventory: [Number(inventoryId)],
    Supplier: [Number(supplier._id)],
    "Product URL": productUrl || "",
    SKU: sku,
    Pack: pack,
    Price: price,
  };
}

function linkMetaChanged(row, fields) {
  return (
    parseProductUrl(row["Product URL"]) !== parseProductUrl(fields["Product URL"]) ||
    text(row.SKU) !== text(fields.SKU) ||
    text(row.Pack) !== text(fields.Pack) ||
    parseMoney(row.Price) !== parseMoney(fields.Price)
  );
}

async function replaceInventorySuppliers(
  env,
  tables,
  inventoryId,
  entries,
  index,
) {
  if (!tables.inventorySuppliers || !tables.suppliers) return [];

  const existingRows = await listAllRows(env, tables.inventorySuppliers, {
    filters: linkHasQuery("Inventory", inventoryId),
  });
  const existingByKey = new Map();
  const duplicateIds = new Set();
  for (const row of existingRows) {
    const mapped = mapLinkedSupplier(row, index.byId);
    if (!mapped?.supplierId) {
      duplicateIds.add(row.id);
      continue;
    }
    const key = linkKey(mapped.supplierId, mapped.productUrl, mapped.sku);
    if (existingByKey.has(key)) {
      duplicateIds.add(row.id);
      continue;
    }
    existingByKey.set(key, row);
  }

  const keep = new Set();
  const out = [];
  for (const entry of normalizeSupplierEntries(entries)) {
    const supplier = await findOrCreateSupplier(env, tables, index, entry);
    if (!supplier) continue;
    const productUrl = parseProductUrl(entry.productUrl);
    const sku = text(entry.sku) || skuFromProductUrl(productUrl);
    const key = linkKey(supplier._id, productUrl, sku);
    keep.add(key);
    const fields = junctionFields(inventoryId, supplier, entry);
    const current = existingByKey.get(key);
    if (current) {
      if (linkMetaChanged(current, fields)) {
        const row = await updateRow(env, tables.inventorySuppliers, current.id, fields);
        const mapped = mapLinkedSupplier(row, index.byId);
        if (mapped) out.push(mapped);
      } else {
        const mapped = mapLinkedSupplier(current, index.byId);
        if (mapped) out.push(mapped);
      }
      continue;
    }
    const row = await createRow(env, tables.inventorySuppliers, fields);
    const mapped = mapLinkedSupplier(row, index.byId);
    if (mapped) out.push(mapped);
  }

  await deleteRowsInOrder(
    env,
    tables.inventorySuppliers,
    existingRows
      .filter((row) => {
        if (duplicateIds.has(row.id)) return true;
        const mapped = mapLinkedSupplier(row, index.byId);
        if (!mapped?.supplierId) return true;
        return !keep.has(
          linkKey(mapped.supplierId, mapped.productUrl, mapped.sku),
        );
      })
      .map((row) => row.id),
  );

  return out;
}

function attachSuppliers(items, linkRows, suppliersById) {
  const byInventory = new Map();
  for (const row of linkRows) {
    const mapped = mapLinkedSupplier(row, suppliersById);
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

function requireInventory(tables) {
  if (!tables.inventory) {
    const error = new Error(
      "Inventory table is not set up yet. Run npm run setup:baserow-ops.",
    );
    error.status = 503;
    throw error;
  }
  return tables;
}

export async function listInventory(env, { includeInactive = false } = {}) {
  const tables = requireInventory(await resolveOpsTableIds(env));
  const [invRows, supplierRows, linkRows] = await Promise.all([
    listAllRows(env, tables.inventory),
    tables.suppliers ? listAllRows(env, tables.suppliers) : Promise.resolve([]),
    tables.inventorySuppliers
      ? listAllRows(env, tables.inventorySuppliers)
      : Promise.resolve([]),
  ]);
  const { byId } = supplierIndex(supplierRows);
  return attachSuppliers(
    invRows.map((row) => mapInventoryItem(row)),
    linkRows,
    byId,
  )
    .filter((item) => includeInactive || item.active !== false)
    .sort((a, b) =>
      String(a.name || "").localeCompare(String(b.name || ""), undefined, {
        sensitivity: "base",
      }),
    );
}

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
    Name: name,
    "Full name": text(input.fullName),
    Kind: normalizeInventoryKind(input.kind),
    ABV: abv,
    "Default unit": text(input.defaultUnit) || null,
    "Estimated cost": parseMoney(input.estimatedCost),
    Notes: notes,
    Active:
      input.active == null
        ? true
        : input.active === true || input.active === "true",
    "Actual qty": qty,
    "Actual unit": actualUnit,
  };
}

function entriesFromInput(input) {
  if (input.suppliers !== undefined) return normalizeSupplierEntries(input.suppliers);
  if (input.supplierLinks !== undefined) {
    return normalizeSupplierEntries(input.supplierLinks);
  }
  return undefined;
}

export async function createInventoryItem(env, input) {
  const tables = requireInventory(await resolveOpsTableIds(env));
  const fields = fieldsFromInput(input);
  if (fields["Actual qty"] != null) {
    fields["Counted at"] = new Date().toISOString();
  }
  const siblings = await listAllRows(env, tables.inventory);
  assertUniqueItemName(
    siblings.map((row) => ({ id: row.id, name: text(row.Name) })),
    fields.Name,
  );
  const row = await createRow(env, tables.inventory, fields);
  const index = await loadSupplierIndex(env, tables);
  const suppliers = await replaceInventorySuppliers(
    env,
    tables,
    row.id,
    entriesFromInput(input) || [],
    index,
  );
  return mapInventoryItem(row, suppliers);
}

export async function updateInventoryItem(env, itemId, input) {
  const tables = requireInventory(await resolveOpsTableIds(env));
  const existing = await getRow(env, tables.inventory, itemId);
  if (!existing?.id) {
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
  if (fields["Actual qty"] !== (mapped.actualQty ?? null) ||
      text(fields["Actual unit"]) !== text(mapped.actualUnit)) {
    fields["Counted at"] =
      fields["Actual qty"] == null ? null : new Date().toISOString();
  }
  const siblings = await listAllRows(env, tables.inventory);
  assertUniqueItemName(
    siblings.map((row) => ({ id: row.id, name: text(row.Name) })),
    fields.Name,
    { exceptId: itemId },
  );
  const row = await updateRow(env, tables.inventory, itemId, fields);
  const index = await loadSupplierIndex(env, tables);
  const nextEntries = entriesFromInput(input);
  const suppliers =
    nextEntries !== undefined
      ? await replaceInventorySuppliers(env, tables, itemId, nextEntries, index)
      : attachSuppliers(
          [mapped],
          tables.inventorySuppliers
            ? await listAllRows(env, tables.inventorySuppliers)
            : [],
          index.byId,
        )[0].suppliers;
  const next = mapInventoryItem(row, suppliers);
  const nextAbv = text(String(next.abv ?? "")).replace(/%/g, "");
  if (prevAbv !== nextAbv) {
    await recomputeDrinksForInventoryId(env, itemId, { previousAbv: prevAbv });
  }
  return next;
}

export async function deleteInventoryItem(env, itemId) {
  const tables = requireInventory(await resolveOpsTableIds(env));
  const existing = await getRow(env, tables.inventory, itemId);
  if (!existing?.id) {
    const error = new Error("Inventory item not found.");
    error.status = 404;
    throw error;
  }
  if (tables.inventorySuppliers) {
    const links = await listAllRows(env, tables.inventorySuppliers, {
      filters: linkHasQuery("Inventory", itemId),
    });
    await deleteRowsInOrder(
      env,
      tables.inventorySuppliers,
      links.map((row) => row.id),
    );
  }
  await deleteRow(env, tables.inventory, itemId);
  return { ok: true };
}

function lightspeedFieldsFromPatch(patch, countedAt) {
  const sku = text(patch.lightspeedSku);
  const qty = parseQty(patch.actualQty);
  const unit = text(patch.actualUnit);
  const fields = {};
  if (sku) fields["Lightspeed SKU"] = sku;
  if (qty != null) {
    fields["Actual qty"] = qty;
    fields["Actual unit"] = unit;
    if (countedAt) fields["Counted at"] = countedAt;
  } else if (unit) {
    fields["Actual unit"] = unit;
  }
  return fields;
}

/** Write Lightspeed SKU and counted quantity without touching catalog fields. */
export async function applyLightspeedActual(env, patches, countedAt) {
  const tables = requireInventory(await resolveOpsTableIds(env));
  const stamp = countedAt || new Date().toISOString();
  const updated = [];
  for (const patch of patches || []) {
    const id = text(String(patch.id ?? patch._id ?? ""));
    if (!id) continue;
    const fields = lightspeedFieldsFromPatch(patch, stamp);
    if (!Object.keys(fields).length) continue;
    const row = await updateRow(env, tables.inventory, id, fields);
    updated.push(mapInventoryItem(row));
  }
  return updated;
}

/** Explicit create from an unmatched Lightspeed Item row. */
export async function createInventoryFromLightspeed(env, row, countedAt) {
  const tables = requireInventory(await resolveOpsTableIds(env));
  const name = text(row.name);
  if (!name) {
    const error = new Error("Name is required.");
    error.status = 400;
    throw error;
  }
  const siblings = await listAllRows(env, tables.inventory);
  let unique = name;
  try {
    assertUniqueItemName(
      siblings.map((item) => ({ id: item.id, name: text(item.Name) })),
      unique,
    );
  } catch (error) {
    if (error.status !== 409) throw error;
    const sku = text(row.sku);
    unique = sku ? `${name} (${sku})` : `${name} (Lightspeed)`;
    assertUniqueItemName(
      siblings.map((item) => ({ id: item.id, name: text(item.Name) })),
      unique,
    );
  }
  const stamp = countedAt || new Date().toISOString();
  const unit = text(row.unit);
  const defaultUnit = normalizeUnit(unit);
  const fields = {
    Name: unique,
    Kind: kindFromLightspeedRow(row),
    Active: true,
    ...lightspeedFieldsFromPatch(
      {
        lightspeedSku: row.sku,
        actualQty: row.quantity,
        actualUnit: unit,
      },
      stamp,
    ),
  };
  if (defaultUnit) fields["Default unit"] = defaultUnit;
  const created = await createRow(env, tables.inventory, fields);
  return mapInventoryItem(created, []);
}

function requireSuppliersTable(tables) {
  if (!tables.suppliers) {
    const error = new Error(
      "Suppliers table is not set up yet. Run npm run setup:baserow-ops.",
    );
    error.status = 503;
    throw error;
  }
  return tables;
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
    fields.Name = name;
  }
  if (!partial || input.website !== undefined) {
    const raw = text(input.website);
    const website = normalizeWebsite(raw);
    if (raw && !website) {
      const error = new Error("Enter a website URL.");
      error.status = 400;
      throw error;
    }
    fields.Website = website;
  }
  if (!partial || input.notes !== undefined) {
    fields.Notes = text(input.notes);
  }
  return fields;
}

function namedSupplierRows(rows) {
  return (rows || []).map((row) => ({ id: row.id, name: text(row.Name) }));
}

export async function listSuppliers(env) {
  const tables = requireSuppliersTable(await resolveOpsTableIds(env));
  const [rows, links] = await Promise.all([
    listAllRows(env, tables.suppliers),
    tables.inventorySuppliers
      ? listAllRows(env, tables.inventorySuppliers)
      : Promise.resolve([]),
  ]);
  const counts = new Map();
  for (const row of links) {
    const supplierId = linkValue(row.Supplier);
    if (supplierId == null) continue;
    const key = String(supplierId);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return rows
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

export async function createSupplier(env, input) {
  const tables = requireSuppliersTable(await resolveOpsTableIds(env));
  const fields = supplierFieldsFromInput(input || {});
  const siblings = await listAllRows(env, tables.suppliers);
  if (findSupplierNameClash(namedSupplierRows(siblings), fields.Name)) {
    const error = new Error("A supplier with that name already exists.");
    error.status = 409;
    throw error;
  }
  const row = await createRow(env, tables.suppliers, fields);
  return { ...mapSupplier(row), itemCount: 0 };
}

export async function updateSupplier(env, supplierId, input) {
  const tables = requireSuppliersTable(await resolveOpsTableIds(env));
  const id = text(String(supplierId || ""));
  if (!id) {
    const error = new Error("Missing id.");
    error.status = 400;
    throw error;
  }
  const existing = await getRow(env, tables.suppliers, id);
  if (!existing?.id) {
    const error = new Error("Supplier not found.");
    error.status = 404;
    throw error;
  }
  const fields = supplierFieldsFromInput(input || {}, { partial: true });
  if (fields.Name) {
    const siblings = await listAllRows(env, tables.suppliers);
    if (findSupplierNameClash(namedSupplierRows(siblings), fields.Name, { exceptId: id })) {
      const error = new Error("A supplier with that name already exists.");
      error.status = 409;
      throw error;
    }
  }
  const row = await updateRow(env, tables.suppliers, id, fields);
  let itemCount = 0;
  if (tables.inventorySuppliers) {
    const links = await listAllRows(env, tables.inventorySuppliers, {
      filters: linkHasQuery("Supplier", id),
    });
    itemCount = links.length;
  }
  return { ...mapSupplier(row), itemCount };
}

export async function deleteSupplier(env, supplierId) {
  const tables = requireSuppliersTable(await resolveOpsTableIds(env));
  const id = text(String(supplierId || ""));
  if (!id) {
    const error = new Error("Missing id.");
    error.status = 400;
    throw error;
  }
  const existing = await getRow(env, tables.suppliers, id);
  if (!existing?.id) {
    const error = new Error("Supplier not found.");
    error.status = 404;
    throw error;
  }
  if (tables.inventorySuppliers) {
    const links = await listAllRows(env, tables.inventorySuppliers, {
      filters: linkHasQuery("Supplier", id),
    });
    if (links.length) {
      const error = new Error(
        links.length === 1
          ? "This supplier is used on 1 inventory item. Remove that link first."
          : `This supplier is used on ${links.length} inventory items. Remove those links first.`,
      );
      error.status = 409;
      throw error;
    }
  }
  await deleteRow(env, tables.suppliers, id);
  return { ok: true };
}
