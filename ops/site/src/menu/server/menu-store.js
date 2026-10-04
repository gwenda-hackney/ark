import {
  boolField,
  createRow,
  deleteRow,
  deleteRowsInOrder,
  fileUrl,
  getRow,
  linkHasQuery,
  linkIds,
  linkValue,
  listAllRows,
  resolveOpsTableIds,
  updateRow,
  uploadUserFile,
} from "../../../../../shared/baserow.js";
import {
  computeRecipeAbv,
  computeRecipeVolumeMl,
  formatAbv,
  inventoryAbvById,
  normalizeIngredients,
  normalizeUnit,
  parseQuantity,
} from "./menu.js";
import { assertUniqueItemName, itemSlug } from "../item-key.js";
import { mergeLegacyPrices, mirrorPrices, normalizePrices, serializePrices } from "../prices.js";
import { parsePublishSnapshots } from "../../inventory/server/reconcile.js";
import { normalizeLightspeedStatus } from "../../inventory/lightspeed-stock.js";
import { flattenMenuSections, nestMenuSections } from "../menu-sections.js";
import {
  listPosMenus,
  mapPosMenuLinks,
} from "./pos-menu-store.js";
import {
  attachPlacements,
  applyPlacementDerivedFields,
  legacyFieldsFromPlacements,
  replaceMenuPlacements,
  resolvePlacementsForWrite,
} from "./menu-placements.js";
import {
  METRICS,
  OVERRIDE_FIELDS,
  OVERRIDE_KEYS,
  isMetricOverridden,
  resolveMetric,
} from "../metric-override.js";
import {
  ANALYSIS_NOTE_FIELD,
  parseStoredAnalyzeNote,
  serializeAnalyzeNote,
} from "../analyze-note.js";

function text(value) {
  if (typeof value !== "string") return "";
  return value.trim();
}

function unitFromBaserow(value) {
  if (typeof value === "string") return normalizeUnit(value);
  if (value && typeof value === "object" && typeof value.value === "string") {
    return normalizeUnit(value.value);
  }
  return "";
}

function selectValue(value) {
  if (typeof value === "string") return value.trim();
  if (value && typeof value === "object" && typeof value.value === "string") {
    return value.value.trim();
  }
  return "";
}

function normalizeDrinkType(value) {
  const raw = selectValue(value).toLowerCase();
  if (raw === "pour" || raw === "beer" || raw === "packaged" || raw === "postmix") {
    return raw;
  }
  return "cocktail";
}

const COCKTAIL_TYPES = new Set([
  "spritz",
  "highball",
  "sour",
  "stirred",
  "negroni",
  "fizz",
  "other",
]);

function normalizeCocktailType(value) {
  const raw = selectValue(value).toLowerCase();
  return COCKTAIL_TYPES.has(raw) ? raw : "";
}

function mapIngredient(row) {
  return {
    id: row.id,
    name: text(row.Name),
    quantity: parseQuantity(row.Qty),
    unit: unitFromBaserow(row.Unit),
    note: text(row.Note),
    abv: text(row.ABV) || undefined,
    order: parseQuantity(row.Order) ?? 0,
    itemId: linkValue(row["Menu Item"]),
    inventoryId:
      linkValue(row.Inventory) != null
        ? String(linkValue(row.Inventory))
        : undefined,
  };
}

function mapSection(row) {
  return {
    _id: String(row.id),
    id: String(row.id),
    title: text(row.Name),
    slug: text(row.Slug),
    subtitle: text(row.Subtitle) || undefined,
    orderRank: parseQuantity(row.Order) ?? 0,
    parentId: linkValue(row.Parent) != null ? String(linkValue(row.Parent)) : null,
    parentTitle: undefined,
    sanityId: text(row["Sanity ID"]) || undefined,
    items: [],
  };
}

/**
 * The price table as JSON. Price / Alt price and the two SKU columns are
 * still written from its first two rows. Until the column exists (see
 * migrations/2026-10-04-menu-prices-column.mjs) rows read from those and
 * saves leave it out.
 */
export const PRICES_FIELD = "Prices";

/** Baserow returns every column on a row, so a row says whether the table has one. */
export function rowHasField(row, field) {
  return Boolean(row) && Object.prototype.hasOwnProperty.call(row, field);
}

export function mapItem(row) {
  const photo = fileUrl(row.Photo);
  const drinkType = normalizeDrinkType(row["Drink type"]);
  const prices = mergeLegacyPrices({
    drinkType,
    prices: row[PRICES_FIELD],
    price: text(row.Price),
    priceAlt: text(row["Alt price"]),
    lightspeedSku: text(row["Lightspeed SKU"]),
    lightspeedSkuAlt: text(row["Lightspeed SKU alt"]),
  });
  return {
    _id: String(row.id),
    id: String(row.id),
    name: text(row.Name),
    description: text(row["Menu line"]) || undefined,
    lockDescription: boolField(row["Lock menu line"]),
    price: text(row.Price) || undefined,
    priceAlt: text(row["Alt price"]) || undefined,
    prices,
    drinkType,
    cocktailType: normalizeCocktailType(row["Cocktail type"]) || undefined,
    notes: text(row.Type) || undefined,
    glassware: text(row.Glassware) || undefined,
    garnish: text(row.Garnish) || undefined,
    ice: text(row.Ice) || undefined,
    method: text(row.Method) || undefined,
    abv: text(row.ABV) || undefined,
    volume: text(row.Volume) || undefined,
    // Missing column or off: the editor and saves still treat a stored figure
    // that isn't the recipe's as set by hand (metric-override.js).
    // Only "on" is passed along, so a mapped row sent back as a save never
    // claims a field is locked.
    abvOverride: boolField(row[OVERRIDE_FIELDS.abv]) || undefined,
    volumeOverride: boolField(row[OVERRIDE_FIELDS.volume]) || undefined,
    producer: text(row.Producer) || undefined,
    orderRank: parseQuantity(row.Order) ?? 0,
    sectionId: linkValue(row.Section) != null ? String(linkValue(row.Section)) : null,
    sanityId: text(row["Sanity ID"]) || undefined,
    onDigitalMenu: row["On digital menu"] == null ? true : boolField(row["On digital menu"]),
    onPrintMenu: row["On print menu"] == null ? true : boolField(row["On print menu"]),
    publishSnapshots: parsePublishSnapshots(row["Publish snapshots"]),
    lightspeedSku: text(row["Lightspeed SKU"]) || undefined,
    lightspeedSkuAlt: text(row["Lightspeed SKU alt"]) || undefined,
    lightspeedName: text(row["Lightspeed name"]) || undefined,
    lightspeedMenuScreen: text(row["Lightspeed menu/screen"]) || undefined,
    lightspeedStatus: normalizeLightspeedStatus(row["Lightspeed status"]) || undefined,
    posMenus: mapPosMenuLinks(row["POS menus"]),
    analysisNote: parseStoredAnalyzeNote(row[ANALYSIS_NOTE_FIELD]),
    image: photo
      ? {
          alt: text(row.Name),
          asset: { url: photo },
        }
      : undefined,
    ingredients: [],
  };
}

export async function loadMenuTree(env) {
  const tables = await resolveOpsTableIds(env);
  const [sectionRows, itemRows, ingredientRows, placementRows] = await Promise.all([
    listAllRows(env, tables.sections),
    listAllRows(env, tables.items),
    listAllRows(env, tables.ingredients),
    tables.menuPlacements
      ? listAllRows(env, tables.menuPlacements)
      : Promise.resolve([]),
  ]);

  const sections = sectionRows
    .map(mapSection)
    .filter((section) => Boolean(section.title || section.slug))
    .sort((a, b) => a.orderRank - b.orderRank);
  const byId = new Map(sections.map((section) => [section._id, section]));
  for (const section of sections) {
    if (section.parentId && byId.has(section.parentId)) {
      section.parentTitle = byId.get(section.parentId).title;
    }
  }

  const ingredientsByItem = new Map();
  for (const row of ingredientRows) {
    const ing = mapIngredient(row);
    if (!ing.itemId) continue;
    const key = String(ing.itemId);
    const list = ingredientsByItem.get(key) ?? [];
    list.push(ing);
    ingredientsByItem.set(key, list);
  }
  for (const list of ingredientsByItem.values()) {
    list.sort((a, b) => a.order - b.order || a.id - b.id);
  }

  let items = itemRows
    .map(mapItem)
    .filter((item) => Boolean(item.name))
    .sort((a, b) => a.orderRank - b.orderRank);
  items = attachPlacements(items, placementRows);
  const posMenuIndex = tables.posMenus
    ? new Map(
        (await listPosMenus(env)).map((menu) => [String(menu.id), menu]),
      )
    : new Map();
  for (const item of items) {
    if (posMenuIndex.size && item.placements?.length) {
      item.placements = item.placements.map((row) => {
        if (row.channel !== "pos" || row.posMenuName) return row;
        const menu = posMenuIndex.get(String(row.posMenuId));
        return menu ? { ...row, posMenuName: menu.name } : row;
      });
      Object.assign(item, applyPlacementDerivedFields(item));
    }
    item.ingredients = ingredientsByItem.get(item._id) || [];
    const section = item.sectionId ? byId.get(item.sectionId) : null;
    if (section) {
      section.items.push(item);
      item.section = {
        _id: section._id,
        title: section.title,
        parentTitle: section.parentTitle,
      };
    }
  }

  return { tables, sections: nestMenuSections(sections), items };
}

async function loadInventoryAbvMap(env, tables) {
  if (!tables.inventory) return new Map();
  const rows = await listAllRows(env, tables.inventory);
  return inventoryAbvById(
    rows.map((row) => ({
      id: String(row.id),
      abv: text(row.ABV) || undefined,
    })),
  );
}

/** The recipe's ABV and volume, formatted as stored ("12.5%", "120 ml"); "" when it can't say. */
export function recipeMetrics(ingredients, inventoryById) {
  const abv = computeRecipeAbv(ingredients, inventoryById);
  const volumeMl = computeRecipeVolumeMl(ingredients);
  return {
    abv: abv != null ? formatAbv(abv) : "",
    volume: volumeMl != null ? `${volumeMl} ml` : "",
  };
}

/** Whether the table has the ABV / Volume override columns (any row says). */
export function rowHasOverrideColumns(row) {
  return rowHasField(row, OVERRIDE_FIELDS.abv) && rowHasField(row, OVERRIDE_FIELDS.volume);
}

/**
 * A cocktail's ABV and Volume: the recipe's, unless set by hand
 * (metric-override.js). `input` is what the save sent (abv / volume and the
 * abvOverride / volumeOverride flags); `saved` the drink as stored, for a
 * value or flag the save left out. The flags are written only when the
 * table has their columns.
 */
export function drinkMetricsFields(
  drinkType,
  ingredients,
  inventoryById,
  { input = {}, saved = {}, overrideColumns = false } = {},
) {
  if (drinkType !== "cocktail") return {};
  const recipe = recipeMetrics(ingredients, inventoryById);
  const fields = {};
  for (const metric of METRICS) {
    const key = OVERRIDE_KEYS[metric];
    const { value, override } = resolveMetric({
      given: input[key],
      saved: saved[key],
      stored: Object.prototype.hasOwnProperty.call(input, metric) ? input[metric] : saved[metric],
      recipe: recipe[metric],
    });
    fields[metric === "abv" ? "ABV" : "Volume"] = value;
    if (overrideColumns) fields[OVERRIDE_FIELDS[metric]] = override;
  }
  return fields;
}

function boolInput(value, fallback = true) {
  if (value == null) return fallback;
  if (value === false || value === "false") return false;
  return value === true || value === "true";
}

/**
 * `pricesGiven`: the save sent the whole price table, so its SKUs are written
 * as they are, blanks included (a SKU cleared in the table is cleared).
 * Otherwise a SKU is only written when there is one, as before the table.
 * `pricesColumn`: the table has the Prices column.
 */
export function itemFieldsFromInput(
  input,
  { requireSection = true, pricesGiven = false, pricesColumn = false } = {},
) {
  const name = text(input.name);
  if (!name) {
    const error = new Error("Name is required.");
    error.status = 400;
    throw error;
  }
  const sectionId = Number(input.sectionId);
  const hasSection = Number.isFinite(sectionId) && sectionId > 0;
  if (requireSection && !hasSection) {
    const error = new Error("Section is required.");
    error.status = 400;
    throw error;
  }

  const drinkType = normalizeDrinkType(input.drinkType);
  const cocktailType =
    drinkType === "cocktail" ? normalizeCocktailType(input.cocktailType) : "";
  const prices = pricesGiven
    ? normalizePrices({ ...input, drinkType })
    : mergeLegacyPrices({ ...input, drinkType });
  const mirrored = mirrorPrices(prices);

  return {
    Name: name,
    ...(hasSection ? { Section: [sectionId] } : {}),
    "Menu line": text(input.description) || "",
    "Lock menu line": false,
    Price: mirrored.price,
    "Alt price": mirrored.priceAlt,
    ...(pricesColumn ? { [PRICES_FIELD]: serializePrices(prices) } : {}),
    "Drink type": drinkType,
    "Cocktail type": cocktailType || null,
    Type: text(input.notes),
    Glassware: text(input.glassware),
    Garnish: text(input.garnish),
    Ice: text(input.ice),
    Method: drinkType === "cocktail" ? text(input.method) : "",
    Signature: false,
    ABV: text(input.abv),
    Volume: text(input.volume),
    Producer: text(input.producer),
    Order: parseQuantity(input.orderRank) ?? 0,
    "On digital menu": boolInput(input.onDigitalMenu, true),
    "On print menu": boolInput(input.onPrintMenu, true),
    ...(text(input.sanityId) ? { "Sanity ID": text(input.sanityId) } : {}),
    ...(pricesGiven || mirrored.lightspeedSku
      ? { "Lightspeed SKU": mirrored.lightspeedSku }
      : {}),
    ...(pricesGiven || mirrored.lightspeedSkuAlt
      ? { "Lightspeed SKU alt": mirrored.lightspeedSkuAlt }
      : {}),
    ...(Object.prototype.hasOwnProperty.call(input, "lightspeedName")
      ? { "Lightspeed name": text(input.lightspeedName) }
      : {}),
    ...(Object.prototype.hasOwnProperty.call(input, "lightspeedMenuScreen")
      ? { "Lightspeed menu/screen": text(input.lightspeedMenuScreen) }
      : {}),
    ...(normalizeLightspeedStatus(input.lightspeedStatus)
      ? { "Lightspeed status": normalizeLightspeedStatus(input.lightspeedStatus) }
      : {}),
    ...(Object.prototype.hasOwnProperty.call(input, "analysisNote")
      ? { [ANALYSIS_NOTE_FIELD]: serializeAnalyzeNote(input.analysisNote) }
      : {}),
  };
}

function ingredientFields(ing, itemId, index, tables) {
  const payload = {
    Name: ing.name,
    "Menu Item": [Number(itemId)],
    Qty: ing.quantity ?? null,
    Unit: ing.unit || null,
    Note: ing.note || "",
    // Linked lines: inventory is the ABV source. Do not denormalize.
    ABV: ing.inventoryId ? "" : ing.abv || "",
    Order: ing.order ?? index + 1,
  };
  if (tables.inventory) {
    payload.Inventory = ing.inventoryId ? [Number(ing.inventoryId)] : [];
  }
  return payload;
}

export function ingredientLineSignature(ing, index) {
  return {
    name: text(ing.name),
    quantity: ing.quantity ?? null,
    unit: ing.unit || "",
    note: ing.note || "",
    abv: ing.inventoryId ? "" : text(ing.abv),
    order: ing.order ?? index + 1,
    inventoryId: ing.inventoryId ? String(ing.inventoryId) : "",
  };
}

function claimExistingIngredient(unused, ing) {
  const id = ing.id != null && ing.id !== "" ? String(ing.id) : "";
  if (id && unused.has(id)) {
    const row = unused.get(id);
    unused.delete(id);
    return row;
  }
  const wantName = text(ing.name).toLowerCase();
  const wantInv = ing.inventoryId ? String(ing.inventoryId) : "";
  for (const [key, row] of unused) {
    const mapped = mapIngredient(row);
    const sameName = text(mapped.name).toLowerCase() === wantName;
    const sameInv = String(mapped.inventoryId || "") === wantInv;
    if (sameName && sameInv) {
      unused.delete(key);
      return row;
    }
  }
  return null;
}

export function planIngredientSync(existingRows, ingredients) {
  const normalized = normalizeIngredients(ingredients);
  const unused = new Map(
    (existingRows || []).map((row) => [String(row.id), row]),
  );
  const ops = [];
  for (const [index, ing] of normalized.entries()) {
    const match = claimExistingIngredient(unused, ing);
    if (!match) {
      ops.push({ action: "create", incoming: ing, index });
      continue;
    }
    const prev = ingredientLineSignature(mapIngredient(match), index);
    const next = ingredientLineSignature(ing, index);
    if (JSON.stringify(prev) === JSON.stringify(next)) {
      ops.push({ action: "keep", row: match, index });
    } else {
      ops.push({ action: "update", row: match, incoming: ing, index });
    }
  }
  return { ops, deletes: [...unused.values()] };
}

async function replaceIngredients(env, tables, itemId, ingredients) {
  const existing = await listAllRows(env, tables.ingredients, {
    filters: linkHasQuery("Menu Item", itemId),
  });
  const { ops, deletes } = planIngredientSync(existing, ingredients);
  const saved = [];
  for (const op of ops) {
    if (op.action === "keep") {
      saved.push(mapIngredient(op.row));
      continue;
    }
    const fields = ingredientFields(op.incoming, itemId, op.index, tables);
    if (op.action === "update") {
      const row = await updateRow(env, tables.ingredients, op.row.id, fields);
      saved.push(mapIngredient(row));
      continue;
    }
    const row = await createRow(env, tables.ingredients, fields);
    saved.push(mapIngredient(row));
  }
  await deleteRowsInOrder(
    env,
    tables.ingredients,
    deletes.map((row) => row.id),
  );
  return saved;
}

export async function createMenuItem(env, input) {
  const tables = await resolveOpsTableIds(env);
  const ingredients = normalizeIngredients(input.ingredients);
  const inventoryById = await loadInventoryAbvMap(env, tables);
  const posMenus = tables.posMenus ? await listPosMenus(env) : [];
  const placements = resolvePlacementsForWrite(input, {
    defaultPosMenus: posMenus,
  });
  const derived = applyPlacementDerivedFields({ ...input, placements });
  const payload = {
    ...input,
    ...derived,
    sectionId: derived.sectionId || input.sectionId,
    posMenuIds: (derived.posMenus || []).map((menu) => menu.id),
  };
  const hasGuest = placements.some(
    (row) => row.channel === "print" || row.channel === "digital",
  );
  const siblings = await listAllRows(env, tables.items);
  const fields = {
    ...itemFieldsFromInput(payload, {
      requireSection: hasGuest,
      pricesGiven: Array.isArray(input.prices),
      // No other drink to look at: leave the column out and rebuild from Price / Alt price.
      pricesColumn: rowHasField(siblings[0], PRICES_FIELD),
    }),
    ...legacyFieldsFromPlacements(placements, tables),
  };
  assertUniqueItemName(
    siblings.map((row) => ({ id: row.id, name: text(row.Name) })),
    fields.Name,
    { kind: "drink" },
  );
  Object.assign(
    fields,
    drinkMetricsFields(fields["Drink type"], ingredients, inventoryById, {
      input,
      overrideColumns: rowHasOverrideColumns(siblings[0]),
    }),
  );
  if (!fields.Order) {
    const maxOrder = siblings.reduce((max, row) => {
      const order = parseQuantity(row.Order) ?? 0;
      return order > max ? order : max;
    }, 0);
    fields.Order = maxOrder + 1;
  }
  const row = await createRow(env, tables.items, fields);
  const savedIngredients = await replaceIngredients(env, tables, row.id, ingredients);
  const savedPlacements = await replaceMenuPlacements(
    env,
    tables,
    row.id,
    placements,
  );
  const item = applyPlacementDerivedFields({
    ...mapItem(row),
    ingredients: savedIngredients,
    placements: savedPlacements,
  });
  item.sectionId = item.sectionId
    ? String(item.sectionId)
    : linkValue(row.Section) != null
      ? String(linkValue(row.Section))
      : input.sectionId
        ? String(input.sectionId)
        : null;
  return item;
}

export async function updateMenuItem(env, itemId, input) {
  const tables = await resolveOpsTableIds(env);
  const existing = await getRow(env, tables.items, itemId);
  if (!existing?.id) {
    const error = new Error("Item not found.");
    error.status = 404;
    throw error;
  }
  const existingMapped = mapItem(existing);
  if (tables.menuPlacements) {
    const placementRows = await listAllRows(env, tables.menuPlacements, {
      filters: linkHasQuery("Menu item", itemId),
    });
    Object.assign(
      existingMapped,
      attachPlacements([existingMapped], placementRows)[0],
    );
  }
  const ingredients = normalizeIngredients(input.ingredients);
  const inventoryById = await loadInventoryAbvMap(env, tables);
  const posMenus = tables.posMenus ? await listPosMenus(env) : [];
  const placements = resolvePlacementsForWrite(input, {
    existingItem: existingMapped,
    defaultPosMenus: posMenus,
  });
  const derived = applyPlacementDerivedFields({
    ...existingMapped,
    ...input,
    placements,
  });
  const payload = {
    ...existingMapped,
    ...input,
    ...derived,
    sectionId:
      derived.sectionId ||
      input.sectionId ||
      linkValue(existing.Section),
    posMenuIds: (derived.posMenus || []).map((menu) => menu.id),
  };
  const hasGuest = placements.some(
    (row) => row.channel === "print" || row.channel === "digital",
  );
  const fields = {
    ...itemFieldsFromInput(payload, {
      requireSection: hasGuest,
      pricesGiven: Array.isArray(input.prices),
      pricesColumn: rowHasField(existing, PRICES_FIELD),
    }),
    ...legacyFieldsFromPlacements(placements, tables),
  };
  Object.assign(
    fields,
    drinkMetricsFields(fields["Drink type"], ingredients, inventoryById, {
      input,
      saved: existingMapped,
      overrideColumns: rowHasOverrideColumns(existing),
    }),
  );
  const siblings = await listAllRows(env, tables.items);
  assertUniqueItemName(
    siblings.map((row) => ({ id: row.id, name: text(row.Name) })),
    fields.Name,
    { exceptId: itemId, kind: "drink" },
  );
  const row = await updateRow(env, tables.items, itemId, fields);
  const savedIngredients = await replaceIngredients(env, tables, itemId, ingredients);
  const savedPlacements = await replaceMenuPlacements(
    env,
    tables,
    itemId,
    placements,
  );
  return applyPlacementDerivedFields({
    ...mapItem(row),
    ingredients: savedIngredients,
    placements: savedPlacements,
  });
}

/**
 * The ABV and Volume to write after a stock item's ABV changed, for one
 * cocktail row: the new recipe figure for each field that follows the
 * recipe, nothing for one set by hand. `before` is the recipe as it was
 * (old stock ABV): a stored figure that isn't it was typed in, even with
 * the flag off or its column missing (metric-override.js).
 */
export function recomputedMetricFields(row, ingredients, inventoryById, before) {
  const next = recipeMetrics(ingredients, inventoryById);
  const fields = {};
  for (const metric of METRICS) {
    const column = metric === "abv" ? "ABV" : "Volume";
    if (!next[metric]) continue;
    const flag = boolField(row[OVERRIDE_FIELDS[metric]]);
    if (isMetricOverridden(flag, text(row[column]), before[metric])) continue;
    if (text(row[column]) !== next[metric]) fields[column] = next[metric];
  }
  return fields;
}

/**
 * After inventory ABV changes, recompute drink ABV for every cocktail that
 * links that stock row. `previousAbv`: the stock item's ABV before the
 * change, so a figure typed over the old recipe is told from one that
 * followed it. Without it only the override flags are trusted.
 */
export async function recomputeDrinksForInventoryId(env, inventoryId, { previousAbv } = {}) {
  const invId = Number(inventoryId);
  if (!Number.isFinite(invId)) return { updated: 0 };

  const tables = await resolveOpsTableIds(env);
  if (!tables.inventory || !tables.ingredients || !tables.items) {
    return { updated: 0 };
  }

  const [ingredientRows, inventoryById] = await Promise.all([
    listAllRows(env, tables.ingredients),
    loadInventoryAbvMap(env, tables),
  ]);
  const previousById =
    previousAbv === undefined
      ? null
      : new Map([...inventoryById, [String(invId), text(String(previousAbv ?? "")) || undefined]]);

  const menuItemIds = new Set();
  for (const row of ingredientRows) {
    if (!linkIds(row.Inventory).includes(invId)) continue;
    for (const itemId of linkIds(row["Menu Item"])) {
      menuItemIds.add(itemId);
    }
  }
  if (menuItemIds.size === 0) return { updated: 0 };

  const ingredientsByItem = new Map();
  for (const row of ingredientRows) {
    const ing = mapIngredient(row);
    if (!ing.itemId) continue;
    const key = Number(ing.itemId);
    if (!menuItemIds.has(key)) continue;
    const list = ingredientsByItem.get(key) ?? [];
    list.push(ing);
    ingredientsByItem.set(key, list);
  }

  let updated = 0;
  for (const itemId of menuItemIds) {
    const itemRow = await getRow(env, tables.items, itemId);
    if (!itemRow?.id) continue;
    const drinkType = normalizeDrinkType(itemRow["Drink type"]);
    if (drinkType !== "cocktail") continue;
    const ingredients = ingredientsByItem.get(itemId) || [];
    // No old ABV to compare with: a stored figure only counts as typed in when flagged.
    const before = previousById
      ? recipeMetrics(ingredients, previousById)
      : { abv: text(itemRow.ABV), volume: text(itemRow.Volume) };
    const metrics = recomputedMetricFields(itemRow, ingredients, inventoryById, before);
    if (!Object.keys(metrics).length) continue;
    await updateRow(env, tables.items, itemId, metrics);
    updated += 1;
  }
  return { updated };
}

export async function deleteMenuItem(env, itemId) {
  const tables = await resolveOpsTableIds(env);
  const mine = await listAllRows(env, tables.ingredients, {
    filters: linkHasQuery("Menu Item", itemId),
  });
  await deleteRowsInOrder(
    env,
    tables.ingredients,
    mine.map((row) => row.id),
  );
  if (tables.menuPlacements) {
    const placementRows = await listAllRows(env, tables.menuPlacements, {
      filters: linkHasQuery("Menu item", itemId),
    });
    await deleteRowsInOrder(
      env,
      tables.menuPlacements,
      placementRows.map((row) => row.id),
    );
  }
  await deleteRow(env, tables.items, itemId);
  return { id: String(itemId) };
}

/** Clear guest + POS placements (off till and off guest menus). */
export async function archiveMenuItem(env, itemId) {
  return updateMenuItem(env, itemId, { archived: true, placements: [] });
}

export async function setMenuItemPhoto(env, itemId, bytes, { filename, contentType, alt }) {
  const tables = await resolveOpsTableIds(env);
  const uploaded = await uploadUserFile(env, bytes, { filename, contentType });
  const row = await updateRow(env, tables.items, itemId, {
    Photo: [{ name: uploaded.name }],
    ...(alt ? {} : {}),
  });
  const item = mapItem(row);
  if (!item.image?.asset?.url) {
    const error = new Error(
      'Photo did not attach. Menu Items is missing a "Photo" file field (or Baserow ignored the upload). Run npm run setup:baserow-ops against this Ops database.',
    );
    error.status = 502;
    throw error;
  }
  return item;
}

export async function clearMenuItemPhoto(env, itemId) {
  const tables = await resolveOpsTableIds(env);
  const row = await updateRow(env, tables.items, itemId, { Photo: [] });
  return mapItem(row);
}

export async function importIngredientsForItems(env, rows) {
  const { items, tables } = await loadMenuTree(env);
  const byName = new Map(items.map((item) => [item.name.toLowerCase(), item]));
  const grouped = new Map();
  for (const row of rows) {
    const key = row.cocktail.trim();
    if (!key) continue;
    const list = grouped.get(key) ?? [];
    list.push(row);
    grouped.set(key, list);
  }

  const matched = [];
  const unmatched = [];
  for (const [cocktail, ingredientRows] of grouped) {
    const existing = byName.get(cocktail.toLowerCase());
    if (!existing) {
      unmatched.push(cocktail);
      continue;
    }
    const ingredients = normalizeIngredients(ingredientRows);
    await replaceIngredients(env, tables, existing._id, ingredients);
    matched.push({ id: existing._id, name: existing.name, count: ingredients.length });
  }
  return { matched, unmatched };
}

function fail(status, message) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

function nextSectionOrder(rows) {
  return (
    rows.reduce((max, row) => {
      const order = parseQuantity(row.Order) ?? 0;
      return order > max ? order : max;
    }, 0) + 1
  );
}

function mappedSectionsFromRows(rows) {
  const sections = rows
    .map(mapSection)
    .filter((section) => Boolean(section.title || section.slug));
  const byId = new Map(sections.map((section) => [section._id, section]));
  for (const section of sections) {
    if (section.parentId && byId.has(section.parentId)) {
      section.parentTitle = byId.get(section.parentId).title;
    }
  }
  return { sections, byId };
}

async function assertSectionParent(byId, parentId, { exceptId } = {}) {
  if (!parentId) return null;
  const parent = byId.get(String(parentId));
  if (!parent) fail(400, "Parent section not found.");
  if (parent.parentId) {
    fail(400, "Only chapters can have groups. Pick a top-level section.");
  }
  if (exceptId && String(parent._id) === String(exceptId)) {
    fail(400, "A section cannot sit under itself.");
  }
  return parent;
}

function assertUniqueSectionSlug(sections, slug, exceptId) {
  const except = exceptId != null ? String(exceptId) : "";
  const clash = sections.find((section) => {
    if (except && section._id === except) return false;
    return itemSlug(section.slug || section.title) === slug;
  });
  if (clash) fail(409, "A section with that name already exists.");
}

export async function createMenuSection(env, input) {
  const tables = await resolveOpsTableIds(env);
  const title = text(input.title);
  if (!title) fail(400, "Section name is required.");
  const slug = itemSlug(input.slug) || itemSlug(title);
  if (!slug) fail(400, "Use letters or numbers in the section name.");
  const rows = await listAllRows(env, tables.sections);
  const { sections, byId } = mappedSectionsFromRows(rows);
  assertUniqueSectionSlug(sections, slug);
  const parentId = text(input.parentId) || null;
  await assertSectionParent(byId, parentId);
  const fields = {
    Name: title,
    Slug: slug,
    Subtitle: text(input.subtitle),
    Order: parseQuantity(input.orderRank) ?? nextSectionOrder(rows),
    Parent: parentId ? [Number(parentId)] : [],
  };
  const row = await createRow(env, tables.sections, fields);
  return mapSection(row);
}

export async function updateMenuSection(env, sectionId, input) {
  const tables = await resolveOpsTableIds(env);
  const existing = await getRow(env, tables.sections, sectionId);
  if (!existing?.id) fail(404, "Section not found.");
  const current = mapSection(existing);
  const title = text(input.title) || current.title;
  if (!title) fail(400, "Section name is required.");
  const slug = itemSlug(input.slug) || current.slug || itemSlug(title);
  if (!slug) fail(400, "Use letters or numbers in the section name.");
  const rows = await listAllRows(env, tables.sections);
  const { sections, byId } = mappedSectionsFromRows(rows);
  assertUniqueSectionSlug(sections, slug, current._id);
  const parentId =
    input.parentId === "" || input.parentId === null
      ? null
      : text(input.parentId) || current.parentId;
  if (parentId) {
    const descendants = new Set(
      sections
        .filter((section) => section.parentId === current._id)
        .map((section) => section._id),
    );
    if (descendants.has(String(parentId))) {
      fail(400, "A chapter cannot sit under one of its groups.");
    }
  }
  await assertSectionParent(byId, parentId, { exceptId: current._id });
  const fields = {
    Name: title,
    Slug: slug,
    Subtitle: input.subtitle == null ? current.subtitle || "" : text(input.subtitle),
    Parent: parentId ? [Number(parentId)] : [],
  };
  if (input.orderRank != null) {
    const order = parseQuantity(input.orderRank);
    if (order != null) fields.Order = order;
  }
  const row = await updateRow(env, tables.sections, sectionId, fields);
  return mapSection(row);
}

export async function deleteMenuSection(env, sectionId) {
  const { sections, items, tables } = await loadMenuTree(env);
  const section = flattenMenuSections(sections).find(
    (entry) => entry._id === String(sectionId),
  );
  if (!section) fail(404, "Section not found.");
  if ((section.subsections || []).length) {
    fail(409, "Remove the groups under this chapter first.");
  }
  const drinks = (items || []).filter(
    (item) => item.sectionId === String(sectionId),
  );
  if (drinks.length) {
    fail(409, "Move the drinks out of this section first.");
  }
  await deleteRow(env, tables.sections, sectionId);
  return { id: String(sectionId) };
}

function lightspeedMenuFields(patch) {
  const sku = text(patch?.lightspeedSku);
  const skuAlt = text(patch?.lightspeedSkuAlt);
  const name = text(patch?.lightspeedName);
  const status = normalizeLightspeedStatus(patch?.lightspeedStatus);
  const fields = {};
  if (sku) fields["Lightspeed SKU"] = sku;
  if (skuAlt) fields["Lightspeed SKU alt"] = skuAlt;
  if (Object.prototype.hasOwnProperty.call(patch || {}, "lightspeedName")) {
    fields["Lightspeed name"] = name;
  }
  if (Object.prototype.hasOwnProperty.call(patch || {}, "lightspeedMenuScreen")) {
    fields["Lightspeed menu/screen"] = text(patch.lightspeedMenuScreen);
  }
  if (status) fields["Lightspeed status"] = status;
  if (patch?.adoptName) {
    const drinkName = text(patch.name || patch.lightspeedName);
    if (drinkName) fields.Name = drinkName;
  }
  return fields;
}

/** Write Lightspeed SKU and match status onto Menu Items. */
export async function applyLightspeedMenuMatch(env, patches) {
  const tables = await resolveOpsTableIds(env);
  const updated = [];
  for (const patch of patches || []) {
    const id = text(String(patch.id ?? patch._id ?? ""));
    if (!id) continue;
    const fields = lightspeedMenuFields(patch);
    if (!Object.keys(fields).length) continue;
    const row = await updateRow(env, tables.items, id, fields);
    updated.push(mapItem(row));
  }
  return updated;
}

