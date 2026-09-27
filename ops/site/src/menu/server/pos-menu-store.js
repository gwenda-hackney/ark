/**
 * Lightspeed POS menus (Fall 2026, the live menu, etc.).
 * Menu items can sit on more than one.
 */
import {
  boolField,
  createRow,
  deleteRow,
  listAllRows,
  resolveOpsTableIds,
  updateRow,
} from "../../platform/baserow.js";
import { namesClash } from "../item-key.js";

import { DEFAULT_POS_MENU_NAME, LEGACY_DEFAULT_POS_MENU_NAME, LIVE_POS_MENU_NAME } from "../pos-menus.js";

export { DEFAULT_POS_MENU_NAME, LEGACY_DEFAULT_POS_MENU_NAME, LIVE_POS_MENU_NAME };

function text(value) {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "object" && typeof value.value === "string") {
    return value.value.trim();
  }
  return "";
}

function fail(status, message) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

function parseOrder(value) {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function mapPosMenu(row) {
  if (!row) return null;
  const name = text(row.Name);
  if (!name) return null;
  return {
    id: String(row.id),
    name,
    orderRank: parseOrder(row.Order),
    isDefault: boolField(row.Default),
  };
}

export function mapPosMenuLinks(value) {
  if (!Array.isArray(value)) return [];
  const out = [];
  const seen = new Set();
  for (const entry of value) {
    if (entry == null) continue;
    const id =
      typeof entry === "object"
        ? String(entry.id || "")
        : String(entry);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const name =
      typeof entry === "object"
        ? text(entry.value || entry.name)
        : "";
    out.push({ id, name });
  }
  return out;
}

export function normalizePosMenuIds(value) {
  if (!Array.isArray(value)) return [];
  const out = [];
  const seen = new Set();
  for (const entry of value) {
    const id = String(
      entry && typeof entry === "object" ? entry.id ?? entry._id ?? "" : entry,
    ).trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export function posMenuLinkFields(input, tables) {
  if (!tables?.posMenus) return {};
  if (!Object.prototype.hasOwnProperty.call(input || {}, "posMenuIds")) {
    return {};
  }
  return {
    "POS menus": normalizePosMenuIds(input.posMenuIds)
      .map((id) => Number(id))
      .filter((id) => Number.isFinite(id) && id > 0),
  };
}

function sortMenus(menus) {
  return [...(menus || [])].sort(
    (a, b) =>
      (a.orderRank ?? 0) - (b.orderRank ?? 0) ||
      String(a.name || "").localeCompare(String(b.name || "")),
  );
}

export async function listPosMenus(env) {
  const tables = await resolveOpsTableIds(env);
  if (!tables.posMenus) return [];
  const rows = await listAllRows(env, tables.posMenus);
  return sortMenus(rows.map(mapPosMenu).filter(Boolean));
}

export function defaultPosMenus(menus) {
  const list = Array.isArray(menus) ? menus : [];
  const marked = list.filter((row) => row.isDefault);
  if (marked.length) return marked;
  return list.slice(0, 1);
}

export function defaultPosMenuIds(menus) {
  return defaultPosMenus(menus).map((row) => row.id);
}

function assertUniqueMenuName(menus, name, exceptId = "") {
  const trimmed = text(name);
  if (!trimmed) fail(400, "Menu name is required.");
  const clash = (menus || []).find((row) => {
    if (exceptId && String(row.id) === String(exceptId)) return false;
    return namesClash(row.name, trimmed);
  });
  if (clash) fail(409, "A POS menu with that name already exists.");
  return trimmed;
}

async function clearOtherDefaults(env, tableId, keepId) {
  const rows = await listAllRows(env, tableId);
  for (const row of rows) {
    if (String(row.id) === String(keepId)) continue;
    if (!boolField(row.Default)) continue;
    await updateRow(env, tableId, row.id, { Default: false });
  }
}

export async function createPosMenu(env, input) {
  const tables = await resolveOpsTableIds(env);
  if (!tables.posMenus) fail(503, "POS Menus is not set up. Run setup:baserow-ops.");
  const existing = await listPosMenus(env);
  const name = assertUniqueMenuName(existing, input?.name);
  const isDefault =
    input?.isDefault === true || existing.length === 0;
  const order =
    parseOrder(input?.orderRank) ||
    existing.reduce((max, row) => Math.max(max, row.orderRank || 0), 0) + 1;
  const row = await createRow(env, tables.posMenus, {
    Name: name,
    Order: order,
    Default: isDefault,
  });
  if (isDefault) await clearOtherDefaults(env, tables.posMenus, row.id);
  return mapPosMenu(row);
}

export async function updatePosMenu(env, menuId, input) {
  const tables = await resolveOpsTableIds(env);
  if (!tables.posMenus) fail(503, "POS Menus is not set up. Run setup:baserow-ops.");
  const existing = await listPosMenus(env);
  const current = existing.find((row) => String(row.id) === String(menuId));
  if (!current) fail(404, "POS menu not found.");
  const name = Object.prototype.hasOwnProperty.call(input || {}, "name")
    ? assertUniqueMenuName(existing, input.name, current.id)
    : current.name;
  const isDefault = Object.prototype.hasOwnProperty.call(input || {}, "isDefault")
    ? Boolean(input.isDefault)
    : current.isDefault;
  const order = Object.prototype.hasOwnProperty.call(input || {}, "orderRank")
    ? parseOrder(input.orderRank)
    : current.orderRank;
  const row = await updateRow(env, tables.posMenus, menuId, {
    Name: name,
    Order: order,
    Default: isDefault,
  });
  if (isDefault) await clearOtherDefaults(env, tables.posMenus, menuId);
  return mapPosMenu(row);
}

export async function deletePosMenu(env, menuId) {
  const tables = await resolveOpsTableIds(env);
  if (!tables.posMenus) fail(503, "POS Menus is not set up. Run setup:baserow-ops.");
  const existing = await listPosMenus(env);
  const current = existing.find((row) => String(row.id) === String(menuId));
  if (!current) fail(404, "POS menu not found.");
  await deleteRow(env, tables.posMenus, menuId);
  if (current.isDefault) {
    const leftover = existing.filter((row) => String(row.id) !== String(menuId));
    if (leftover[0]) {
      await updateRow(env, tables.posMenus, leftover[0].id, { Default: true });
    }
  }
  return { id: String(menuId) };
}
