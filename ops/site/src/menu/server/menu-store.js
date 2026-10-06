/**
 * Drinks, their recipes and the menu's sections, stored through the
 * MenuRepository (menu-repository.js): records in, the shapes ops shows out.
 */
import { parseImageAssetId, sanityImageUrl } from "../../../../../shared/sanity-image.js";
import { sanityProjectId, sanityUploadImage } from "../../platform/sanity.js";
import { menuRepository } from "./menu-repository.js";
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
import { mergeLegacyPrices, mirrorPrices, normalizePrices, parsePriceRows } from "../prices.js";
import { parsePublishSnapshots } from "../../inventory/server/reconcile.js";
import { normalizeLightspeedStatus } from "../../inventory/lightspeed-stock.js";
import { flattenMenuSections, nestMenuSections } from "../menu-sections.js";
import { listPosMenus } from "./pos-menu-store.js";
import {
  attachPlacements,
  applyPlacementDerivedFields,
  legacyFieldsFromPlacements,
  replaceMenuPlacements,
  resolvePlacementsForWrite,
} from "./menu-placements.js";
import {
  METRICS,
  OVERRIDE_KEYS,
  isMetricOverridden,
  resolveMetric,
} from "../metric-override.js";
import { parseStoredAnalyzeNote, serializeAnalyzeNote } from "../analyze-note.js";

function text(value) {
  if (typeof value !== "string") return "";
  return value.trim();
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

function idText(value) {
  return value == null ? null : String(value);
}

/** An ingredients record → a recipe line. */
function mapIngredient(record) {
  return {
    id: record.id,
    name: text(record.name),
    quantity: parseQuantity(record.quantity),
    unit: normalizeUnit(text(record.unit)),
    note: text(record.note),
    abv: text(record.abv) || undefined,
    order: parseQuantity(record.order) ?? 0,
    itemId: record.itemId,
    inventoryId: idText(record.inventoryId) ?? undefined,
  };
}

/** A menu_sections record → a section. */
function mapSection(record) {
  return {
    _id: String(record.id),
    id: String(record.id),
    title: text(record.name),
    slug: text(record.slug),
    subtitle: text(record.subtitle) || undefined,
    orderRank: parseQuantity(record.order) ?? 0,
    parentId: idText(record.parentId),
    parentTitle: undefined,
    sanityId: text(record.sanityId) || undefined,
    items: [],
  };
}

/**
 * A drink's photo is a Sanity asset (#183). One from before is still a
 * Baserow file (legacyPhotoUrl, Baserow only) until the backfill
 * (migrations/2026-10-06-menu-photos-backfill.mjs) gives it an asset.
 */
function itemImage(record, projectId) {
  const name = text(record.name);
  const assetId = text(record.photoAsset);
  if (parseImageAssetId(assetId)) {
    return { alt: name, asset: { _id: assetId, url: sanityImageUrl(projectId, assetId) } };
  }
  return record.legacyPhotoUrl ? { alt: name, asset: { url: record.legacyPhotoUrl } } : undefined;
}

/** What mapItem needs from the runtime: the Sanity project photos are shown from. */
function mapOptions(env, extra = {}) {
  return { projectId: sanityProjectId(env), ...extra };
}

/** Section titles and POS menu names by id, to label placements and POS menus. */
function menuLabels(sections, posMenus) {
  return {
    sectionTitles: new Map(sections.map((section) => [String(section.id), text(section.name)])),
    posMenuNames: new Map(posMenus.map((menu) => [String(menu.id), menu.name])),
  };
}

async function loadLabels(repo, posMenus) {
  return menuLabels(await repo.list("menu_sections"), posMenus);
}

/** A menu_items record → the drink ops shows. `posMenuNames` names its POS menus. */
export function mapItem(record, { projectId, posMenuNames } = {}) {
  const drinkType = normalizeDrinkType(record.drinkType);
  const prices = mergeLegacyPrices({
    drinkType,
    prices: record.prices,
    price: text(record.price),
    priceAlt: text(record.altPrice),
    lightspeedSku: text(record.lightspeedSku),
    lightspeedSkuAlt: text(record.lightspeedSkuAlt),
  });
  return {
    _id: String(record.id),
    id: String(record.id),
    name: text(record.name),
    description: text(record.menuLine) || undefined,
    lockDescription: Boolean(record.lockMenuLine),
    price: text(record.price) || undefined,
    priceAlt: text(record.altPrice) || undefined,
    prices,
    drinkType,
    cocktailType: normalizeCocktailType(record.cocktailType) || undefined,
    notes: text(record.notes) || undefined,
    glassware: text(record.glassware) || undefined,
    garnish: text(record.garnish) || undefined,
    ice: text(record.ice) || undefined,
    method: text(record.method) || undefined,
    abv: text(record.abv) || undefined,
    volume: text(record.volume) || undefined,
    // Off (or a store without the flag yet): the editor and saves still treat
    // a stored figure that isn't the recipe's as set by hand (metric-override.js).
    // Only "on" is passed along, so a mapped drink sent back as a save never
    // claims a field is locked.
    abvOverride: record.abvOverride || undefined,
    volumeOverride: record.volumeOverride || undefined,
    producer: text(record.producer) || undefined,
    orderRank: parseQuantity(record.order) ?? 0,
    sectionId: idText(record.sectionId),
    sanityId: text(record.sanityId) || undefined,
    onDigitalMenu: record.onDigitalMenu !== false,
    onPrintMenu: record.onPrintMenu !== false,
    publishSnapshots: parsePublishSnapshots(record.publishSnapshots),
    lightspeedSku: text(record.lightspeedSku) || undefined,
    lightspeedSkuAlt: text(record.lightspeedSkuAlt) || undefined,
    lightspeedName: text(record.lightspeedName) || undefined,
    lightspeedMenuScreen: text(record.lightspeedMenuScreen) || undefined,
    lightspeedStatus: normalizeLightspeedStatus(record.lightspeedStatus) || undefined,
    posMenus: (record.posMenuIds || []).map((id) => ({
      id: String(id),
      name: posMenuNames?.get(String(id)) || "",
    })),
    analysisNote: parseStoredAnalyzeNote(record.analysisNote),
    image: itemImage(record, projectId),
    ingredients: [],
  };
}

/** Every section (nested), and every named drink with its recipe and placements. */
export async function loadMenuTree(env, repo = menuRepository(env)) {
  const [sectionRecords, itemRecords, ingredientRecords, placementRecords, posMenus] = await Promise.all([
    repo.list("menu_sections"),
    repo.list("menu_items"),
    repo.list("ingredients"),
    repo.list("menu_placements"),
    listPosMenus(env, repo),
  ]);
  const labels = menuLabels(sectionRecords, posMenus);

  const sections = sectionRecords
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
  for (const record of ingredientRecords) {
    const ing = mapIngredient(record);
    if (!ing.itemId) continue;
    const key = String(ing.itemId);
    const list = ingredientsByItem.get(key) ?? [];
    list.push(ing);
    ingredientsByItem.set(key, list);
  }
  for (const list of ingredientsByItem.values()) {
    list.sort((a, b) => a.order - b.order || a.id - b.id);
  }

  const options = mapOptions(env, labels);
  let items = itemRecords
    .map((record) => mapItem(record, options))
    .filter((item) => Boolean(item.name))
    .sort((a, b) => a.orderRank - b.orderRank);
  items = attachPlacements(items, placementRecords, labels);
  for (const item of items) {
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

  return { repo, sections: nestMenuSections(sections), items };
}

async function loadInventoryAbvMap(repo) {
  const records = await repo.list("inventory");
  return inventoryAbvById(
    records.map((record) => ({
      id: String(record.id),
      abv: text(record.abv) || undefined,
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

/**
 * A cocktail's ABV and Volume: the recipe's, unless set by hand
 * (metric-override.js). `input` is what the save sent (abv / volume and the
 * abvOverride / volumeOverride flags); `saved` the drink as stored, for a
 * value or flag the save left out.
 */
export function drinkMetricsFields(
  drinkType,
  ingredients,
  inventoryById,
  { input = {}, saved = {} } = {},
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
    fields[metric] = value;
    fields[key] = override;
  }
  return fields;
}

function boolInput(value, fallback = true) {
  if (value == null) return fallback;
  if (value === false || value === "false") return false;
  return value === true || value === "true";
}

/**
 * The menu_items fields a save writes. `pricesGiven`: the save sent the
 * whole price table, so its SKUs are written as they are, blanks included
 * (a SKU cleared in the table is cleared). Otherwise a SKU is only written
 * when there is one, as before the table.
 */
export function itemFieldsFromInput(
  input,
  { requireSection = true, pricesGiven = false } = {},
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
    name,
    ...(hasSection ? { sectionId } : {}),
    menuLine: text(input.description) || "",
    lockMenuLine: false,
    price: mirrored.price,
    altPrice: mirrored.priceAlt,
    // Every price; Price / Alt price are its first two rows.
    prices: parsePriceRows(prices),
    drinkType,
    cocktailType: cocktailType || "",
    notes: text(input.notes),
    glassware: text(input.glassware),
    garnish: text(input.garnish),
    ice: text(input.ice),
    method: drinkType === "cocktail" ? text(input.method) : "",
    signature: false,
    abv: text(input.abv),
    volume: text(input.volume),
    producer: text(input.producer),
    order: parseQuantity(input.orderRank) ?? 0,
    onDigitalMenu: boolInput(input.onDigitalMenu, true),
    onPrintMenu: boolInput(input.onPrintMenu, true),
    ...(text(input.sanityId) ? { sanityId: text(input.sanityId) } : {}),
    ...(pricesGiven || mirrored.lightspeedSku
      ? { lightspeedSku: mirrored.lightspeedSku }
      : {}),
    ...(pricesGiven || mirrored.lightspeedSkuAlt
      ? { lightspeedSkuAlt: mirrored.lightspeedSkuAlt }
      : {}),
    ...(Object.prototype.hasOwnProperty.call(input, "lightspeedName")
      ? { lightspeedName: text(input.lightspeedName) }
      : {}),
    ...(Object.prototype.hasOwnProperty.call(input, "lightspeedMenuScreen")
      ? { lightspeedMenuScreen: text(input.lightspeedMenuScreen) }
      : {}),
    ...(normalizeLightspeedStatus(input.lightspeedStatus)
      ? { lightspeedStatus: normalizeLightspeedStatus(input.lightspeedStatus) }
      : {}),
    ...(Object.prototype.hasOwnProperty.call(input, "analysisNote")
      ? { analysisNote: serializeAnalyzeNote(input.analysisNote) }
      : {}),
  };
}

/** The ingredients fields for recipe line `ing` of drink `itemId`. */
function ingredientFields(ing, itemId, index) {
  return {
    name: ing.name,
    itemId: Number(itemId),
    quantity: ing.quantity ?? null,
    unit: ing.unit || "",
    note: ing.note || "",
    // Linked lines: inventory is the ABV source. Do not denormalize.
    abv: ing.inventoryId ? "" : ing.abv || "",
    order: ing.order ?? index + 1,
    inventoryId: ing.inventoryId ? Number(ing.inventoryId) : null,
  };
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

export function planIngredientSync(existingRecords, ingredients) {
  const normalized = normalizeIngredients(ingredients);
  const unused = new Map(
    (existingRecords || []).map((record) => [String(record.id), record]),
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

/**
 * The repository changes that make drink `itemId`'s recipe `ingredients`,
 * given its stored lines, and how to read the saved recipe back from the
 * write's results (`saved(results, offset)`).
 */
function ingredientChanges(existingRecords, itemId, ingredients) {
  const { ops, deletes } = planIngredientSync(existingRecords, ingredients);
  const changes = [];
  const slots = [];
  for (const op of ops) {
    if (op.action === "keep") {
      slots.push({ record: op.row });
      continue;
    }
    const fields = ingredientFields(op.incoming, itemId, op.index);
    slots.push({ change: changes.length });
    changes.push(
      op.action === "update"
        ? { op: "update", collection: "ingredients", id: op.row.id, fields }
        : { op: "create", collection: "ingredients", fields },
    );
  }
  for (const record of deletes) changes.push({ op: "remove", collection: "ingredients", id: record.id });
  const saved = (results, offset = 0) =>
    slots.map((slot) => mapIngredient(slot.record ?? results[offset + slot.change]));
  return { changes, saved };
}

async function replaceIngredients(repo, itemId, ingredients) {
  const existing = await repo.list("ingredients", { itemId });
  const { changes, saved } = ingredientChanges(existing, itemId, ingredients);
  return saved(await repo.write(changes));
}

export async function createMenuItem(env, input) {
  const repo = menuRepository(env);
  const ingredients = normalizeIngredients(input.ingredients);
  const [inventoryById, posMenus, siblings] = await Promise.all([
    loadInventoryAbvMap(repo),
    listPosMenus(env, repo),
    repo.list("menu_items"),
  ]);
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
  const fields = {
    ...itemFieldsFromInput(payload, {
      requireSection: hasGuest,
      pricesGiven: Array.isArray(input.prices),
    }),
    ...legacyFieldsFromPlacements(placements),
  };
  assertUniqueItemName(
    siblings.map((record) => ({ id: record.id, name: text(record.name) })),
    fields.name,
    { kind: "drink" },
  );
  Object.assign(
    fields,
    drinkMetricsFields(fields.drinkType, ingredients, inventoryById, { input }),
  );
  if (!fields.order) {
    const maxOrder = siblings.reduce((max, record) => {
      const order = parseQuantity(record.order) ?? 0;
      return order > max ? order : max;
    }, 0);
    fields.order = maxOrder + 1;
  }
  const record = await repo.create("menu_items", fields);
  const labels = await loadLabels(repo, posMenus);
  const savedIngredients = await replaceIngredients(repo, record.id, ingredients);
  const savedPlacements = await replaceMenuPlacements(repo, record.id, placements, labels);
  const item = applyPlacementDerivedFields({
    ...mapItem(record, mapOptions(env, labels)),
    ingredients: savedIngredients,
    placements: savedPlacements,
  });
  item.sectionId = item.sectionId
    ? String(item.sectionId)
    : record.sectionId != null
      ? String(record.sectionId)
      : input.sectionId
        ? String(input.sectionId)
        : null;
  return item;
}

export async function updateMenuItem(env, itemId, input) {
  const repo = menuRepository(env);
  const existing = await repo.get("menu_items", itemId);
  if (!existing) {
    const error = new Error("Item not found.");
    error.status = 404;
    throw error;
  }
  const [inventoryById, posMenus, placementRecords, siblings, sections] = await Promise.all([
    loadInventoryAbvMap(repo),
    listPosMenus(env, repo),
    repo.list("menu_placements", { itemId }),
    repo.list("menu_items"),
    repo.list("menu_sections"),
  ]);
  const labels = menuLabels(sections, posMenus);
  const existingMapped = attachPlacements(
    [mapItem(existing, mapOptions(env, labels))],
    placementRecords,
    labels,
  )[0];
  const ingredients = normalizeIngredients(input.ingredients);
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
      existing.sectionId,
    posMenuIds: (derived.posMenus || []).map((menu) => menu.id),
  };
  const hasGuest = placements.some(
    (row) => row.channel === "print" || row.channel === "digital",
  );
  const fields = {
    ...itemFieldsFromInput(payload, {
      requireSection: hasGuest,
      pricesGiven: Array.isArray(input.prices),
    }),
    ...legacyFieldsFromPlacements(placements),
  };
  Object.assign(
    fields,
    drinkMetricsFields(fields.drinkType, ingredients, inventoryById, {
      input,
      saved: existingMapped,
    }),
  );
  assertUniqueItemName(
    siblings.map((record) => ({ id: record.id, name: text(record.name) })),
    fields.name,
    { exceptId: itemId, kind: "drink" },
  );
  const record = await repo.update("menu_items", itemId, fields);
  const savedIngredients = await replaceIngredients(repo, itemId, ingredients);
  const savedPlacements = await replaceMenuPlacements(repo, itemId, placements, labels);
  return applyPlacementDerivedFields({
    ...mapItem(record, mapOptions(env, labels)),
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
export function recomputedMetricFields(record, ingredients, inventoryById, before) {
  const next = recipeMetrics(ingredients, inventoryById);
  const fields = {};
  for (const metric of METRICS) {
    if (!next[metric]) continue;
    const flag = Boolean(record[OVERRIDE_KEYS[metric]]);
    if (isMetricOverridden(flag, text(record[metric]), before[metric])) continue;
    if (text(record[metric]) !== next[metric]) fields[metric] = next[metric];
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

  const repo = menuRepository(env);
  const [ingredientRecords, inventoryById] = await Promise.all([
    repo.list("ingredients"),
    loadInventoryAbvMap(repo),
  ]);
  const previousById =
    previousAbv === undefined
      ? null
      : new Map([...inventoryById, [String(invId), text(String(previousAbv ?? "")) || undefined]]);

  const menuItemIds = new Set();
  for (const record of ingredientRecords) {
    if (record.inventoryId === invId && record.itemId) menuItemIds.add(record.itemId);
  }
  if (menuItemIds.size === 0) return { updated: 0 };

  const ingredientsByItem = new Map();
  for (const record of ingredientRecords) {
    if (!menuItemIds.has(record.itemId)) continue;
    const list = ingredientsByItem.get(record.itemId) ?? [];
    list.push(mapIngredient(record));
    ingredientsByItem.set(record.itemId, list);
  }

  // Every drink in one write: a stock item can be in many recipes.
  const changes = [];
  for (const record of await repo.list("menu_items")) {
    if (!menuItemIds.has(record.id)) continue;
    if (normalizeDrinkType(record.drinkType) !== "cocktail") continue;
    const ingredients = ingredientsByItem.get(record.id) || [];
    // No old ABV to compare with: a stored figure only counts as typed in when flagged.
    const before = previousById
      ? recipeMetrics(ingredients, previousById)
      : { abv: text(record.abv), volume: text(record.volume) };
    const metrics = recomputedMetricFields(record, ingredients, inventoryById, before);
    if (!Object.keys(metrics).length) continue;
    changes.push({ op: "update", collection: "menu_items", id: record.id, fields: metrics });
  }
  await repo.write(changes);
  return { updated: changes.length };
}

/** Removes the drink, its recipe and its placements. */
export async function deleteMenuItem(env, itemId) {
  await menuRepository(env).remove("menu_items", itemId);
  return { id: String(itemId) };
}

/** Clear guest + POS placements (off till and off guest menus). */
export async function archiveMenuItem(env, itemId) {
  return updateMenuItem(env, itemId, { archived: true, placements: [] });
}

/** Upload a drink's photo to Sanity; the asset is the photo's only copy (#183). */
export async function setMenuItemPhoto(env, itemId, bytes, { filename, contentType }) {
  const asset = await sanityUploadImage(env, bytes, { filename, contentType });
  if (!parseImageAssetId(asset?._id)) {
    const error = new Error("The photo didn't upload to Sanity.");
    error.status = 502;
    throw error;
  }
  const record = await menuRepository(env).update("menu_items", itemId, { photoAsset: asset._id });
  const item = mapItem(record, mapOptions(env));
  if (item.image?.asset?._id !== asset._id) {
    const error = new Error(
      'Photo did not attach. Menu Items is missing a "Photo asset" field: run the ops pre-deploy migrations (npm run migrate).',
    );
    error.status = 502;
    throw error;
  }
  return item;
}

/** Takes the photo off the drink. The Sanity asset stays: the live site may still show it. */
export async function clearMenuItemPhoto(env, itemId) {
  const record = await menuRepository(env).update("menu_items", itemId, { photoAsset: "" });
  return mapItem(record, mapOptions(env));
}

/** Recipes for many drinks at once, matched by name; one repository write. */
export async function importIngredientsForItems(env, rows) {
  const { items, repo } = await loadMenuTree(env);
  const byName = new Map(items.map((item) => [item.name.toLowerCase(), item]));
  const grouped = new Map();
  for (const row of rows) {
    const key = row.cocktail.trim();
    if (!key) continue;
    const list = grouped.get(key) ?? [];
    list.push(row);
    grouped.set(key, list);
  }

  const existingByItem = new Map();
  for (const record of await repo.list("ingredients")) {
    const list = existingByItem.get(record.itemId) ?? [];
    list.push(record);
    existingByItem.set(record.itemId, list);
  }
  const matched = [];
  const unmatched = [];
  const changes = [];
  for (const [cocktail, ingredientRows] of grouped) {
    const existing = byName.get(cocktail.toLowerCase());
    if (!existing) {
      unmatched.push(cocktail);
      continue;
    }
    const ingredients = normalizeIngredients(ingredientRows);
    const planned = ingredientChanges(existingByItem.get(Number(existing._id)) || [], existing._id, ingredients);
    changes.push(...planned.changes);
    matched.push({ id: existing._id, name: existing.name, count: ingredients.length });
  }
  await repo.write(changes);
  return { matched, unmatched };
}

function fail(status, message) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

function nextSectionOrder(records) {
  return (
    records.reduce((max, record) => {
      const order = parseQuantity(record.order) ?? 0;
      return order > max ? order : max;
    }, 0) + 1
  );
}

function mappedSections(records) {
  const sections = records
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
  const repo = menuRepository(env);
  const title = text(input.title);
  if (!title) fail(400, "Section name is required.");
  const slug = itemSlug(input.slug) || itemSlug(title);
  if (!slug) fail(400, "Use letters or numbers in the section name.");
  const records = await repo.list("menu_sections");
  const { sections, byId } = mappedSections(records);
  assertUniqueSectionSlug(sections, slug);
  const parentId = text(input.parentId) || null;
  await assertSectionParent(byId, parentId);
  const record = await repo.create("menu_sections", {
    name: title,
    slug,
    subtitle: text(input.subtitle),
    order: parseQuantity(input.orderRank) ?? nextSectionOrder(records),
    parentId: parentId ? Number(parentId) : null,
  });
  return mapSection(record);
}

export async function updateMenuSection(env, sectionId, input) {
  const repo = menuRepository(env);
  const existing = await repo.get("menu_sections", sectionId);
  if (!existing) fail(404, "Section not found.");
  const current = mapSection(existing);
  const title = text(input.title) || current.title;
  if (!title) fail(400, "Section name is required.");
  const slug = itemSlug(input.slug) || current.slug || itemSlug(title);
  if (!slug) fail(400, "Use letters or numbers in the section name.");
  const { sections, byId } = mappedSections(await repo.list("menu_sections"));
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
    name: title,
    slug,
    subtitle: input.subtitle == null ? current.subtitle || "" : text(input.subtitle),
    parentId: parentId ? Number(parentId) : null,
  };
  if (input.orderRank != null) {
    const order = parseQuantity(input.orderRank);
    if (order != null) fields.order = order;
  }
  return mapSection(await repo.update("menu_sections", sectionId, fields));
}

export async function deleteMenuSection(env, sectionId) {
  const { sections, items, repo } = await loadMenuTree(env);
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
  await repo.remove("menu_sections", sectionId);
  return { id: String(sectionId) };
}

function lightspeedMenuFields(patch) {
  const sku = text(patch?.lightspeedSku);
  const skuAlt = text(patch?.lightspeedSkuAlt);
  const name = text(patch?.lightspeedName);
  const status = normalizeLightspeedStatus(patch?.lightspeedStatus);
  const fields = {};
  if (sku) fields.lightspeedSku = sku;
  if (skuAlt) fields.lightspeedSkuAlt = skuAlt;
  if (Object.prototype.hasOwnProperty.call(patch || {}, "lightspeedName")) {
    fields.lightspeedName = name;
  }
  if (Object.prototype.hasOwnProperty.call(patch || {}, "lightspeedMenuScreen")) {
    fields.lightspeedMenuScreen = text(patch.lightspeedMenuScreen);
  }
  if (status) fields.lightspeedStatus = status;
  if (patch?.adoptName) {
    const drinkName = text(patch.name || patch.lightspeedName);
    if (drinkName) fields.name = drinkName;
  }
  return fields;
}

/** Write Lightspeed SKU and match status onto the drinks, in one repository write. */
export async function applyLightspeedMenuMatch(env, patches) {
  const changes = [];
  for (const patch of patches || []) {
    const id = text(String(patch.id ?? patch._id ?? ""));
    if (!id) continue;
    const fields = lightspeedMenuFields(patch);
    if (!Object.keys(fields).length) continue;
    changes.push({ op: "update", collection: "menu_items", id, fields });
  }
  const options = mapOptions(env);
  return (await menuRepository(env).write(changes)).map((record) => mapItem(record, options));
}

