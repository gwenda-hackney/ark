/**
 * Lightspeed POS menus (Fall 2026, the live menu, etc.).
 * Menu items can sit on more than one. Stored through the MenuRepository
 * (collection pos_menus).
 */
import { namesClash } from "../item-key.js";
import { menuRepository } from "./menu-repository.js";

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

/** A pos_menus record → the menu ops shows; null without a name. */
export function mapPosMenu(record) {
  if (!record) return null;
  const name = text(record.name);
  if (!name) return null;
  return {
    id: String(record.id),
    name,
    orderRank: parseOrder(record.order),
    isDefault: Boolean(record.isDefault),
  };
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

function sortMenus(menus) {
  return [...(menus || [])].sort(
    (a, b) =>
      (a.orderRank ?? 0) - (b.orderRank ?? 0) ||
      String(a.name || "").localeCompare(String(b.name || "")),
  );
}

export async function listPosMenus(env, repo = menuRepository(env)) {
  return sortMenus((await repo.list("pos_menus")).map(mapPosMenu).filter(Boolean));
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

/** Changes that switch Default off on every menu but `keepId`. */
function clearOtherDefaults(menus, keepId) {
  return menus
    .filter((menu) => menu.isDefault && String(menu.id) !== String(keepId))
    .map((menu) => ({ op: "update", collection: "pos_menus", id: menu.id, fields: { isDefault: false } }));
}

export async function createPosMenu(env, input) {
  const repo = menuRepository(env);
  const existing = await listPosMenus(env, repo);
  const name = assertUniqueMenuName(existing, input?.name);
  const isDefault =
    input?.isDefault === true || existing.length === 0;
  const order =
    parseOrder(input?.orderRank) ||
    existing.reduce((max, row) => Math.max(max, row.orderRank || 0), 0) + 1;
  const record = await repo.create("pos_menus", { name, order, isDefault });
  if (isDefault) await repo.write(clearOtherDefaults(existing, record.id));
  return mapPosMenu(record);
}

export async function updatePosMenu(env, menuId, input) {
  const repo = menuRepository(env);
  const existing = await listPosMenus(env, repo);
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
  const [record] = await repo.write([
    { op: "update", collection: "pos_menus", id: menuId, fields: { name, order, isDefault } },
    ...(isDefault ? clearOtherDefaults(existing, menuId) : []),
  ]);
  return mapPosMenu(record);
}

export async function deletePosMenu(env, menuId) {
  const repo = menuRepository(env);
  const existing = await listPosMenus(env, repo);
  const current = existing.find((row) => String(row.id) === String(menuId));
  if (!current) fail(404, "POS menu not found.");
  const leftover = existing.filter((row) => String(row.id) !== String(menuId));
  await repo.write([
    { op: "remove", collection: "pos_menus", id: menuId },
    ...(current.isDefault && leftover[0]
      ? [{ op: "update", collection: "pos_menus", id: leftover[0].id, fields: { isDefault: true } }]
      : []),
  ]);
  return { id: String(menuId) };
}
