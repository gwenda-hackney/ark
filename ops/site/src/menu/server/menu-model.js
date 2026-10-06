/**
 * The menu and inventory records (#186, #127): what the MenuRepository
 * (menu-repository.js) stores, whatever stores it. No I/O and no storage
 * names; the adapters map these to Baserow columns or D1 tables.
 *
 * One collection per table. Ids are numbers (Baserow's row ids, kept by the
 * copy to D1). A link to one record is `<thing>Id` (a number or null); the
 * one link to many, a drink's POS menus, is `posMenuIds` (ids, ascending),
 * which D1 keeps in a junction table.
 *
 *   menu_sections        { id, name, slug, subtitle, parentId, order, sanityId }
 *   pos_menus            { id, name, order, isDefault }
 *   menu_items           { id, name, sectionId, menuLine, lockMenuLine, price,
 *                          altPrice, prices, drinkType, cocktailType, notes,
 *                          glassware, garnish, ice, method, signature, abv,
 *                          volume, abvOverride, volumeOverride, producer,
 *                          photoAsset, order, sanityId, onDigitalMenu,
 *                          onPrintMenu, publishSnapshots, analysisNote,
 *                          lightspeedSku, lightspeedSkuAlt, lightspeedName,
 *                          lightspeedMenuScreen, lightspeedStatus, posMenuIds }
 *   menu_placements      { id, itemId, channel, sectionId, posMenuId, posScreen, order }
 *   inventory            { id, name, fullName, kind, abv, defaultUnit,
 *                          estimatedCost, notes, active, lightspeedSku,
 *                          actualQty, actualUnit, countedAt }
 *   ingredients          { id, name, itemId, inventoryId, quantity, unit, note, abv, order }
 *   suppliers            { id, name, website, notes }
 *   inventory_suppliers  { id, name, inventoryId, supplierId, productUrl, sku, pack, price }
 *
 * `prices` and `publishSnapshots` are JSON values (or null); `analysisNote`
 * is the stored text as is (analyze-note.js reads it). A photo is a Sanity
 * asset id (#183).
 */

/** Field kinds: text ("" when empty), number (or null), bool, link (an id or null), links (ids), json. */
export const MENU_COLLECTIONS = {
  menu_sections: {
    name: "text",
    slug: "text",
    subtitle: "text",
    parentId: { link: "menu_sections" },
    order: "number",
    sanityId: "text",
  },
  pos_menus: {
    name: "text",
    order: "number",
    isDefault: "bool",
  },
  menu_items: {
    name: "text",
    sectionId: { link: "menu_sections" },
    menuLine: "text",
    lockMenuLine: "bool",
    price: "text",
    altPrice: "text",
    prices: "json",
    drinkType: "text",
    cocktailType: "text",
    notes: "text",
    glassware: "text",
    garnish: "text",
    ice: "text",
    method: "text",
    signature: "bool",
    abv: "text",
    volume: "text",
    abvOverride: "bool",
    volumeOverride: "bool",
    producer: "text",
    photoAsset: "text",
    order: "number",
    sanityId: "text",
    // A drink is on both menus until it is taken off.
    onDigitalMenu: { kind: "bool", default: true },
    onPrintMenu: { kind: "bool", default: true },
    publishSnapshots: "json",
    analysisNote: "text",
    lightspeedSku: "text",
    lightspeedSkuAlt: "text",
    lightspeedName: "text",
    lightspeedMenuScreen: "text",
    lightspeedStatus: "text",
    posMenuIds: { links: "pos_menus" },
  },
  menu_placements: {
    itemId: { link: "menu_items" },
    channel: "text",
    sectionId: { link: "menu_sections" },
    posMenuId: { link: "pos_menus" },
    posScreen: "text",
    order: "number",
  },
  inventory: {
    name: "text",
    fullName: "text",
    kind: "text",
    abv: "text",
    defaultUnit: "text",
    estimatedCost: "number",
    notes: "text",
    active: { kind: "bool", default: true },
    lightspeedSku: "text",
    actualQty: "number",
    actualUnit: "text",
    countedAt: "text",
  },
  ingredients: {
    name: "text",
    itemId: { link: "menu_items" },
    inventoryId: { link: "inventory" },
    quantity: "number",
    unit: "text",
    note: "text",
    abv: "text",
    order: "number",
  },
  suppliers: {
    name: "text",
    website: "text",
    notes: "text",
  },
  inventory_suppliers: {
    name: "text",
    inventoryId: { link: "inventory" },
    supplierId: { link: "suppliers" },
    productUrl: "text",
    sku: "text",
    pack: "text",
    price: "number",
  },
};

/** Collections parents first: the order a copy writes them in. */
export const MENU_COLLECTION_NAMES = Object.keys(MENU_COLLECTIONS);

/**
 * What removing a record takes with it, the same in every adapter: a drink's
 * recipe lines and placements, a stock item's or supplier's supplier links.
 * Any other link to a removed record is cleared.
 */
export const CASCADES = {
  menu_items: [
    ["ingredients", "itemId"],
    ["menu_placements", "itemId"],
  ],
  inventory: [["inventory_suppliers", "inventoryId"]],
  suppliers: [["inventory_suppliers", "supplierId"]],
};

/** { kind, default?, target? } for a field. */
export function fieldSpec(spec) {
  if (typeof spec === "string") return { kind: spec };
  if (spec.link) return { kind: "link", target: spec.link };
  if (spec.links) return { kind: "links", target: spec.links };
  return spec;
}

export function collectionFields(collection) {
  const fields = MENU_COLLECTIONS[collection];
  if (!fields) {
    const error = new Error(`Unknown menu collection "${collection}".`);
    error.status = 500;
    throw error;
  }
  return fields;
}

/** The fields that link `collection` to `target` (for clearing links to a removed record). */
export function linksTo(target) {
  const out = [];
  for (const [collection, fields] of Object.entries(MENU_COLLECTIONS)) {
    for (const [key, spec] of Object.entries(fields)) {
      const { kind, target: to } = fieldSpec(spec);
      if (to === target && (kind === "link" || kind === "links"))
        out.push({ collection, key, kind });
    }
  }
  return out;
}

function id(value) {
  if (value == null || value === "") return null;
  const n = Number(typeof value === "object" ? value.id : value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function jsonValue(value) {
  if (value == null || value === "") return null;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

const CLEAN = {
  text: (value) => {
    if (value == null) return "";
    if (typeof value === "object" && value.value != null)
      return String(value.value).trim();
    return String(value).trim();
  },
  number: (value) => {
    if (value == null || value === "") return null;
    const n = Number(String(value).replace(/,/g, ""));
    return Number.isFinite(n) ? n : null;
  },
  bool: (value, spec) =>
    value == null
      ? Boolean(spec.default)
      : value === true || value === 1 || value === "true" || value === "1",
  link: (value) => id(Array.isArray(value) ? value[0] : value),
  links: (value) =>
    [
      ...new Set(
        (Array.isArray(value) ? value : value == null ? [] : [value])
          .map(id)
          .filter(Boolean),
      ),
    ].sort((a, b) => a - b),
  json: jsonValue,
};

function cleanField(spec, value) {
  const field = fieldSpec(spec);
  return CLEAN[field.kind](value, field);
}

/** A whole record, every field cleaned the way every adapter keeps it. */
export function menuRecord(collection, fields = {}) {
  const record = { id: id(fields.id) };
  for (const [key, spec] of Object.entries(collectionFields(collection))) {
    record[key] = cleanField(spec, fields[key]);
  }
  return record;
}

/** Only the fields given (not undefined), cleaned; never the id. */
export function menuFields(collection, fields = {}) {
  const out = {};
  for (const [key, spec] of Object.entries(collectionFields(collection))) {
    if (fields[key] !== undefined) out[key] = cleanField(spec, fields[key]);
  }
  return out;
}

/** The link fields a list can filter by, e.g. ingredients by itemId. */
export function linkFields(collection) {
  return Object.entries(collectionFields(collection))
    .filter(([, spec]) => fieldSpec(spec).kind === "link")
    .map(([key]) => key);
}

/** `where` ({ itemId: 7 }) checked against the collection's link fields, ids as numbers. */
export function whereLinks(collection, where = {}) {
  const allowed = linkFields(collection);
  const out = {};
  for (const [key, value] of Object.entries(where || {})) {
    if (!allowed.includes(key)) {
      const error = new Error(`${collection} can't be listed by ${key}.`);
      error.status = 500;
      throw error;
    }
    out[key] = id(value);
  }
  return out;
}

/** Whether `record` matches every link in `where` (from whereLinks). */
export function matchesWhere(record, where = {}) {
  return Object.entries(where).every(([key, value]) => record[key] === value);
}

export function notFound(collection) {
  const error = new Error(
    `${collection === "menu_items" ? "Item" : "Record"} not found.`,
  );
  error.status = 404;
  return error;
}

/** Sections with each parent before its children, so a copy can insert them in order. */
export function parentsFirst(sections) {
  const byId = new Map(sections.map((section) => [section.id, section]));
  const out = [];
  const placed = new Set();
  const place = (section, seen = new Set()) => {
    if (placed.has(section.id) || seen.has(section.id)) return;
    seen.add(section.id);
    const parent = section.parentId ? byId.get(section.parentId) : null;
    if (parent) place(parent, seen);
    placed.add(section.id);
    out.push(section);
  };
  for (const section of [...sections].sort((a, b) => a.id - b.id))
    place(section);
  return out;
}
