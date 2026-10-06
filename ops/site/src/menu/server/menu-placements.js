/**
 * Per-channel menu placements: print / digital / POS each with its own location.
 *
 * Guest (print|digital) ⇒ at least one POS row. Archive clears all placements.
 * Stored through the MenuRepository (collection menu_placements).
 */
import {
  defaultPosMenuIds,
  normalizePosMenuIds,
} from "./pos-menu-store.js";

export const PLACEMENT_CHANNELS = ["print", "digital", "pos"];

/** Fallback till screens from guest section titles (same map as Lightspeed). */
const POS_SCREEN_BY_SECTION = {
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

function text(value) {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "object" && typeof value.value === "string") {
    return value.value.trim();
  }
  return "";
}

function parsePosScreenInput(raw) {
  const path = String(raw || "")
    .trim()
    .replace(/##/g, "/")
    .replace(/\/+/g, "/")
    .replace(/^\/|\/$/g, "");
  return path;
}

function serializePosScreens(screens) {
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

function defaultPosScreenForItem(item) {
  const title = String(
    item?.section?.title || item?.sectionTitle || "",
  )
    .trim()
    .toLowerCase();
  if (title && POS_SCREEN_BY_SECTION[title]) return POS_SCREEN_BY_SECTION[title];
  return "";
}

function parseOrder(value) {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function normalizePlacementChannel(value) {
  const raw = text(value).toLowerCase();
  if (raw === "print" || raw === "digital" || raw === "pos") return raw;
  return "";
}

/**
 * A menu_placements record → the placement ops shows. `labels` names its
 * section and POS menu: { sectionTitles, posMenuNames }, Maps by id.
 */
export function mapPlacement(record, { sectionTitles, posMenuNames } = {}) {
  if (!record) return null;
  const channel = normalizePlacementChannel(record.channel);
  if (!channel) return null;
  const sectionId = record.sectionId != null ? String(record.sectionId) : null;
  const posMenuId = record.posMenuId != null ? String(record.posMenuId) : null;
  const posScreen = parsePosScreenInput(text(record.posScreen));
  return {
    _id: String(record.id),
    id: String(record.id),
    itemId: record.itemId != null ? String(record.itemId) : "",
    channel,
    sectionId,
    sectionTitle: (sectionId && sectionTitles?.get(sectionId)) || undefined,
    posMenuId,
    posMenuName: (posMenuId && posMenuNames?.get(posMenuId)) || undefined,
    posScreen: posScreen || undefined,
    orderRank: parseOrder(record.order),
  };
}

export function placementKey(entry) {
  const channel = normalizePlacementChannel(entry?.channel);
  if (channel === "print" || channel === "digital") {
    return `${channel}:${String(entry?.sectionId || "").trim()}`;
  }
  if (channel === "pos") {
    return `pos:${String(entry?.posMenuId || "").trim()}:${String(entry?.posScreen || "").trim().toLowerCase()}`;
  }
  return "";
}

/**
 * Normalize client / migrate payloads into placement rows, in the order given.
 * Any number of rows per channel: two Print chapters, two screens on one POS
 * menu. Only exact repeats (same channel and chapter, or same POS menu and
 * screen) collapse into one, since the junction keys rows that way.
 */
export function normalizePlacements(entries) {
  const list = Array.isArray(entries) ? entries : [];
  const out = [];
  const seen = new Set();

  for (const raw of list) {
    const channel = normalizePlacementChannel(raw?.channel);
    if (!channel) continue;
    let row;
    if (channel === "print" || channel === "digital") {
      const sectionId = String(raw.sectionId || raw.section?._id || "").trim();
      if (!sectionId) continue;
      row = {
        channel,
        sectionId,
        sectionTitle: text(raw.sectionTitle || raw.section?.title) || undefined,
        orderRank: parseOrder(raw.orderRank),
      };
    } else {
      const posMenuId = String(raw.posMenuId || raw.posMenu?.id || "").trim();
      const posScreen = parsePosScreenInput(raw.posScreen || raw.lightspeedMenuScreen);
      if (!posMenuId || !posScreen) continue;
      row = {
        channel: "pos",
        posMenuId,
        posMenuName: text(raw.posMenuName || raw.posMenu?.name) || undefined,
        posScreen,
        orderRank: parseOrder(raw.orderRank),
      };
    }
    const key = placementKey(row);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }

  return out;
}

/** Build placements from legacy item fields (pre-junction). */
export function placementsFromLegacyItem(item, { defaultPosMenuIds: defaults = [] } = {}) {
  const sectionId = String(
    item?.sectionId || item?.section?._id || item?.section?._ref || "",
  ).trim();
  const out = [];
  if (item?.onPrintMenu !== false && sectionId) {
    out.push({ channel: "print", sectionId });
  }
  if (item?.onDigitalMenu !== false && sectionId) {
    out.push({ channel: "digital", sectionId });
  }

  const screens = String(item?.lightspeedMenuScreen || "")
    .split(",")
    .map((part) => parsePosScreenInput(part))
    .filter(Boolean);
  const fallbackScreen =
    screens[0] ||
    parsePosScreenInput(defaultPosScreenForItem(item)) ||
    "Signature Cocktails";
  const menuIds = normalizePosMenuIds(
    (item?.posMenus || []).map((menu) => menu.id),
  );
  const ids = menuIds.length ? menuIds : normalizePosMenuIds(defaults);
  const screenFor = (index) => screens[index] || screens[0] || fallbackScreen;
  for (const [index, posMenuId] of ids.entries()) {
    out.push({
      channel: "pos",
      posMenuId,
      posScreen: screenFor(index),
    });
  }
  return normalizePlacements(out);
}

/** Ensure guest channels imply at least one POS placement. */
export function ensurePosForGuest(placements, { defaultPosMenuIds: defaults = [], item } = {}) {
  const list = normalizePlacements(placements);
  const hasGuest = list.some((row) => row.channel === "print" || row.channel === "digital");
  const hasPos = list.some((row) => row.channel === "pos");
  if (!hasGuest || hasPos) return list;
  const screen =
    parsePosScreenInput(defaultPosScreenForItem(item)) ||
    parsePosScreenInput(
      list.find((row) => row.channel === "print" || row.channel === "digital")
        ?.sectionTitle,
    ) ||
    "Signature Cocktails";
  const ids = normalizePosMenuIds(defaults);
  if (!ids.length) return list;
  return normalizePlacements([
    ...list,
    ...ids.map((posMenuId) => ({ channel: "pos", posMenuId, posScreen: screen })),
  ]);
}

/** Archive: no channel placements. */
export function archivedPlacements() {
  return [];
}

export function placementOf(item, channel) {
  const want = normalizePlacementChannel(channel);
  return (item?.placements || []).find((row) => row.channel === want) || null;
}

export function posPlacementsOf(item) {
  return (item?.placements || []).filter((row) => row.channel === "pos");
}

export function hasGuestPlacement(item) {
  return (item?.placements || []).some(
    (row) => row.channel === "print" || row.channel === "digital",
  );
}

export function hasDigitalPlacement(item) {
  return Boolean(placementOf(item, "digital"));
}

export function hasPrintPlacement(item) {
  return Boolean(placementOf(item, "print"));
}

export function digitalSectionId(item) {
  return placementOf(item, "digital")?.sectionId || null;
}

export function printSectionId(item) {
  return placementOf(item, "print")?.sectionId || null;
}

/** Ops list / legacy mirror: print section, else digital, else existing. */
export function primarySectionId(item) {
  return (
    printSectionId(item) ||
    digitalSectionId(item) ||
    (item?.sectionId ? String(item.sectionId) : null)
  );
}

/**
 * Derive legacy item fields from placements so publish / export / UI keep working.
 */
export function applyPlacementDerivedFields(item) {
  if (!item || typeof item !== "object") return item;
  const placements = normalizePlacements(item.placements);
  const print = placements.find((row) => row.channel === "print");
  const digital = placements.find((row) => row.channel === "digital");
  const pos = placements.filter((row) => row.channel === "pos");
  const sectionId = print?.sectionId || digital?.sectionId || item.sectionId || null;
  const screens = [
    ...new Set(pos.map((row) => row.posScreen).filter(Boolean)),
  ];
  return {
    ...item,
    placements,
    onPrintMenu: Boolean(print),
    onDigitalMenu: Boolean(digital),
    sectionId: sectionId ? String(sectionId) : null,
    // One entry per POS menu, though a menu can carry several screens.
    posMenus: [...new Map(
      pos.map((row) => [
        String(row.posMenuId),
        { id: String(row.posMenuId), name: row.posMenuName || "" },
      ]),
    ).values()],
    lightspeedMenuScreen: serializePosScreens(screens) || undefined,
  };
}

/** A placement → the menu_placements fields to store for drink `itemId`. */
function placementFields(itemId, entry) {
  const channel = normalizePlacementChannel(entry.channel);
  const fields = {
    itemId: Number(itemId),
    channel,
    order: parseOrder(entry.orderRank),
    sectionId: null,
    posMenuId: null,
    posScreen: "",
  };
  if (channel === "print" || channel === "digital") {
    const sectionId = Number(entry.sectionId);
    if (Number.isFinite(sectionId) && sectionId > 0) fields.sectionId = sectionId;
  } else if (channel === "pos") {
    const posMenuId = Number(entry.posMenuId);
    if (Number.isFinite(posMenuId) && posMenuId > 0) fields.posMenuId = posMenuId;
    fields.posScreen = parsePosScreenInput(entry.posScreen);
  }
  return fields;
}

function placementChanged(record, fields) {
  const mapped = mapPlacement(record);
  if (!mapped) return true;
  if (mapped.channel !== fields.channel) return true;
  if (mapped.orderRank !== parseOrder(fields.order)) return true;
  if (mapped.channel === "pos") {
    return (
      mapped.posMenuId !== String(fields.posMenuId || "") ||
      mapped.posScreen !== parsePosScreenInput(fields.posScreen)
    );
  }
  return mapped.sectionId !== String(fields.sectionId || "");
}

/**
 * Store drink `itemId`'s placements as `entries`: rows already there are
 * kept or updated, the rest created, and leftovers (and exact repeats)
 * removed, all in one repository write.
 */
export async function replaceMenuPlacements(repo, itemId, entries, labels) {
  const existing = await repo.list("menu_placements", { itemId });
  const existingByKey = new Map();
  const duplicateIds = new Set();
  for (const record of existing) {
    const mapped = mapPlacement(record);
    const key = mapped ? placementKey(mapped) : "";
    if (!key || existingByKey.has(key)) {
      duplicateIds.add(record.id);
      continue;
    }
    existingByKey.set(key, record);
  }

  const keep = new Set();
  const changes = [];
  const slots = [];
  for (const entry of normalizePlacements(entries)) {
    const key = placementKey(entry);
    if (!key) continue;
    keep.add(key);
    const fields = placementFields(itemId, entry);
    const current = existingByKey.get(key);
    if (current && !placementChanged(current, fields)) {
      slots.push({ record: current });
      continue;
    }
    slots.push({ change: changes.length });
    changes.push(
      current
        ? { op: "update", collection: "menu_placements", id: current.id, fields }
        : { op: "create", collection: "menu_placements", fields },
    );
  }
  for (const record of existing) {
    const mapped = mapPlacement(record);
    if (duplicateIds.has(record.id) || !mapped || !keep.has(placementKey(mapped))) {
      changes.push({ op: "remove", collection: "menu_placements", id: record.id });
    }
  }

  const written = await repo.write(changes);
  return slots
    .map((slot) => mapPlacement(slot.record ?? written[slot.change], labels))
    .filter(Boolean);
}

export function attachPlacements(items, placementRecords, labels) {
  const byItem = new Map();
  for (const record of placementRecords || []) {
    const mapped = mapPlacement(record, labels);
    if (!mapped?.itemId) continue;
    const list = byItem.get(mapped.itemId) ?? [];
    list.push(mapped);
    byItem.set(mapped.itemId, list);
  }
  return (items || []).map((item) => {
    const placements = byItem.get(String(item._id || item.id)) || [];
    if (!placements.length) {
      return applyPlacementDerivedFields({
        ...item,
        placements: placementsFromLegacyItem(item),
      });
    }
    return applyPlacementDerivedFields({ ...item, placements });
  });
}

/**
 * Resolve placements for write: explicit input, else keep existing, else legacy.
 * Applies guest⇒POS rule. `archived: true` clears all.
 */
export function resolvePlacementsForWrite(input, { existingItem, defaultPosMenus = [] } = {}) {
  const defaults = defaultPosMenuIds(defaultPosMenus);
  if (input?.archived === true || input?.archive === true) {
    return archivedPlacements();
  }
  if (Object.prototype.hasOwnProperty.call(input || {}, "placements")) {
    return ensurePosForGuest(input.placements, {
      defaultPosMenuIds: defaults,
      item: { ...existingItem, ...input },
    });
  }
  if (existingItem?.placements?.length) {
    const next = { ...existingItem, ...input };
    // Guest flag toggles without placements array still reshape.
    if (
      Object.prototype.hasOwnProperty.call(input || {}, "onPrintMenu") ||
      Object.prototype.hasOwnProperty.call(input || {}, "onDigitalMenu") ||
      Object.prototype.hasOwnProperty.call(input || {}, "sectionId") ||
      Object.prototype.hasOwnProperty.call(input || {}, "posMenuIds") ||
      Object.prototype.hasOwnProperty.call(input || {}, "posMenus") ||
      Object.prototype.hasOwnProperty.call(input || {}, "lightspeedMenuScreen")
    ) {
      return ensurePosForGuest(placementsFromLegacyItem(next, { defaultPosMenuIds: defaults }), {
        defaultPosMenuIds: defaults,
        item: next,
      });
    }
    return ensurePosForGuest(existingItem.placements, {
      defaultPosMenuIds: defaults,
      item: next,
    });
  }
  return ensurePosForGuest(
    placementsFromLegacyItem(
      { ...existingItem, ...input },
      { defaultPosMenuIds: defaults },
    ),
    { defaultPosMenuIds: defaults, item: { ...existingItem, ...input } },
  );
}

/** The drink's own copies of its placements (section, menu flags, POS menus), stored alongside them. */
export function legacyFieldsFromPlacements(placements) {
  const list = normalizePlacements(placements);
  const print = list.find((row) => row.channel === "print");
  const digital = list.find((row) => row.channel === "digital");
  const pos = list.filter((row) => row.channel === "pos");
  const sectionId = Number(print?.sectionId || digital?.sectionId || 0);
  const screens = [...new Set(pos.map((row) => row.posScreen).filter(Boolean))];
  const fields = {
    onPrintMenu: Boolean(print),
    onDigitalMenu: Boolean(digital),
    lightspeedMenuScreen: serializePosScreens(screens),
    posMenuIds: [
      ...new Set(
        pos
          .map((row) => Number(row.posMenuId))
          .filter((id) => Number.isFinite(id) && id > 0),
      ),
    ],
  };
  if (Number.isFinite(sectionId) && sectionId > 0) {
    fields.sectionId = sectionId;
  }
  return fields;
}
