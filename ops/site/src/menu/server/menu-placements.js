/**
 * Per-channel menu placements: print / digital / POS each with its own location.
 *
 * Guest (print|digital) ⇒ at least one POS row. Archive clears all placements.
 */
import {
  createRow,
  deleteRowsInOrder,
  linkHasQuery,
  listAllRows,
  updateRow,
} from "../../platform/baserow.js";
import {
  defaultPosMenuIds,
  mapPosMenuLinks,
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

function linkValue(value) {
  if (Array.isArray(value) && value[0]) {
    const first = value[0];
    if (typeof first === "number") return first;
    if (first && typeof first === "object" && first.id != null) return Number(first.id);
  }
  if (typeof value === "number") return value;
  return null;
}

function linkLabel(value) {
  if (!Array.isArray(value) || !value[0]) return "";
  const first = value[0];
  if (first && typeof first === "object") {
    return text(first.value || first.name);
  }
  return "";
}

function selectValue(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return text(value.value);
  }
  return text(value);
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

export function mapPlacement(row) {
  if (!row) return null;
  const channel = normalizePlacementChannel(row.Channel || row.channel);
  if (!channel) return null;
  const sectionId = linkValue(row.Section);
  const posMenuId = linkValue(row["POS menu"] || row.posMenu);
  const posScreen = parsePosScreenInput(
    selectValue(row["POS screen"]) || text(row.posScreen),
  );
  return {
    _id: String(row.id),
    id: String(row.id),
    itemId: linkValue(row["Menu item"] || row.menuItem) != null
      ? String(linkValue(row["Menu item"] || row.menuItem))
      : "",
    channel,
    sectionId: sectionId != null ? String(sectionId) : null,
    sectionTitle: linkLabel(row.Section) || undefined,
    posMenuId: posMenuId != null ? String(posMenuId) : null,
    posMenuName: linkLabel(row["POS menu"] || row.posMenu) || undefined,
    posScreen: posScreen || undefined,
    orderRank: parseOrder(row.Order),
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
 * Normalize client / migrate payloads into placement rows.
 * At most one print and one digital; many pos (one per menu preferred).
 */
export function normalizePlacements(entries) {
  const list = Array.isArray(entries) ? entries : [];
  const print = [];
  const digital = [];
  const pos = [];
  const seenPos = new Set();

  for (const raw of list) {
    const channel = normalizePlacementChannel(raw?.channel);
    if (!channel) continue;
    if (channel === "print" || channel === "digital") {
      const sectionId = String(raw.sectionId || raw.section?._id || "").trim();
      if (!sectionId) continue;
      const row = {
        channel,
        sectionId,
        sectionTitle: text(raw.sectionTitle || raw.section?.title) || undefined,
        orderRank: parseOrder(raw.orderRank),
      };
      if (channel === "print") print.splice(0, print.length, row);
      else digital.splice(0, digital.length, row);
      continue;
    }
    const posMenuId = String(raw.posMenuId || raw.posMenu?.id || "").trim();
    const posScreen = parsePosScreenInput(raw.posScreen || raw.lightspeedMenuScreen);
    if (!posMenuId || !posScreen) continue;
    const key = `${posMenuId}:${posScreen.toLowerCase()}`;
    if (seenPos.has(key)) continue;
    seenPos.add(key);
    pos.push({
      channel: "pos",
      posMenuId,
      posMenuName: text(raw.posMenuName || raw.posMenu?.name) || undefined,
      posScreen,
      orderRank: parseOrder(raw.orderRank),
    });
  }

  return [...print, ...digital, ...pos];
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
    posMenus: pos.map((row) => ({
      id: String(row.posMenuId),
      name: row.posMenuName || "",
    })),
    lightspeedMenuScreen: serializePosScreens(screens) || undefined,
  };
}

function junctionFields(itemId, entry) {
  const channel = normalizePlacementChannel(entry.channel);
  const fields = {
    "Menu item": [Number(itemId)],
    Channel: channel,
    Order: parseOrder(entry.orderRank),
    Section: [],
    "POS menu": [],
    "POS screen": "",
  };
  if (channel === "print" || channel === "digital") {
    const sectionId = Number(entry.sectionId);
    if (Number.isFinite(sectionId) && sectionId > 0) {
      fields.Section = [sectionId];
    }
  } else if (channel === "pos") {
    const posMenuId = Number(entry.posMenuId);
    if (Number.isFinite(posMenuId) && posMenuId > 0) {
      fields["POS menu"] = [posMenuId];
    }
    fields["POS screen"] = parsePosScreenInput(entry.posScreen);
  }
  return fields;
}

function placementChanged(row, fields) {
  const mapped = mapPlacement(row);
  if (!mapped) return true;
  if (mapped.channel !== fields.Channel) return true;
  if (mapped.orderRank !== parseOrder(fields.Order)) return true;
  if (mapped.channel === "pos") {
    return (
      mapped.posMenuId !== String(linkValue(fields["POS menu"]) || "") ||
      mapped.posScreen !== parsePosScreenInput(fields["POS screen"])
    );
  }
  return mapped.sectionId !== String(linkValue(fields.Section) || "");
}

export async function replaceMenuPlacements(env, tables, itemId, entries) {
  if (!tables?.menuPlacements) return normalizePlacements(entries);

  const existingRows = await listAllRows(env, tables.menuPlacements, {
    filters: linkHasQuery("Menu item", itemId),
  });
  const existingByKey = new Map();
  const duplicateIds = new Set();
  for (const row of existingRows) {
    const mapped = mapPlacement(row);
    if (!mapped) {
      duplicateIds.add(row.id);
      continue;
    }
    const key = placementKey(mapped);
    if (!key || existingByKey.has(key)) {
      duplicateIds.add(row.id);
      continue;
    }
    existingByKey.set(key, row);
  }

  const keep = new Set();
  const out = [];
  for (const entry of normalizePlacements(entries)) {
    const key = placementKey(entry);
    if (!key) continue;
    keep.add(key);
    const fields = junctionFields(itemId, entry);
    const current = existingByKey.get(key);
    if (current) {
      if (placementChanged(current, fields)) {
        const row = await updateRow(env, tables.menuPlacements, current.id, fields);
        const mapped = mapPlacement(row);
        if (mapped) out.push(mapped);
      } else {
        const mapped = mapPlacement(current);
        if (mapped) out.push(mapped);
      }
      continue;
    }
    const row = await createRow(env, tables.menuPlacements, fields);
    const mapped = mapPlacement(row);
    if (mapped) out.push(mapped);
  }

  await deleteRowsInOrder(
    env,
    tables.menuPlacements,
    existingRows
      .filter((row) => {
        if (duplicateIds.has(row.id)) return true;
        const mapped = mapPlacement(row);
        if (!mapped) return true;
        return !keep.has(placementKey(mapped));
      })
      .map((row) => row.id),
  );

  return out;
}

export function attachPlacements(items, placementRows) {
  const byItem = new Map();
  for (const row of placementRows || []) {
    const mapped = mapPlacement(row);
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

/** Legacy Baserow mirrors written alongside the junction. */
export function legacyFieldsFromPlacements(placements, tables) {
  const list = normalizePlacements(placements);
  const print = list.find((row) => row.channel === "print");
  const digital = list.find((row) => row.channel === "digital");
  const pos = list.filter((row) => row.channel === "pos");
  const sectionId = Number(print?.sectionId || digital?.sectionId || 0);
  const screens = [...new Set(pos.map((row) => row.posScreen).filter(Boolean))];
  const fields = {
    "On print menu": Boolean(print),
    "On digital menu": Boolean(digital),
    "Lightspeed menu/screen": serializePosScreens(screens),
  };
  if (Number.isFinite(sectionId) && sectionId > 0) {
    fields.Section = [sectionId];
  }
  if (tables?.posMenus) {
    fields["POS menus"] = pos
      .map((row) => Number(row.posMenuId))
      .filter((id) => Number.isFinite(id) && id > 0);
  }
  return fields;
}

export { mapPosMenuLinks };
