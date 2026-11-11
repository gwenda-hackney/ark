/**
 * The venue's gallery (#291), part of the venue's details: the venue's own
 * photos (the room, the terrace, the drinks), which the website shows in
 * home's photo strip and at the top of the Photos page, in the gallery's
 * order. Event and pop-up kitchen photos aren't here: they go on the event's
 * Images tab (events/server/event-model.js `gallery`).
 *
 * A photo is its Sanity image asset (the only copy, as for event photos,
 * #183), what it shows in a line (the website's alt text), the menu board on
 * home it may be pinned up on, and when and by whom it was added. The
 * gallery is a list: its order is the website's. Plain objects and rules, no
 * I/O: the page and the server both use it.
 */
import { parseImageAssetId } from "../../../../shared/sanity-image.js";

/**
 * @typedef {"" | "drinks" | "food"} PhotoMenu
 * @typedef {{
 *   key: string,
 *   asset: string,
 *   description: string,
 *   menu: PhotoMenu,
 *   added: string,
 *   addedBy: string,
 * }} GalleryPhoto
 */

/**
 * The menu boards on home a photo may be pinned up on, by what it shows
 * (the website's lib/photos.js PHOTO_MENUS): the newest few marked for each.
 */
export const PHOTO_MENUS = ["drinks", "food"];

/** A line saying what the photo shows: read out by screen readers. */
export const DESCRIPTION_MAX_LENGTH = 200;

/** One line, its spaces tidied. */
export function descriptionOf(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

/** "drinks", "food", or "" for none (anything else is kept as given, for galleryPhotoProblems to name). */
function menuOf(value) {
  const menu = String(value ?? "")
    .trim()
    .toLowerCase();
  return menu === "none" ? "" : menu;
}

/** A new photo's key: short, random, the Sanity array item's _key. */
export function newPhotoKey() {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 16);
}

/**
 * A photo as kept, cleaned; null when it isn't one (no key, or no Sanity
 * image asset).
 * @returns {GalleryPhoto | null}
 */
export function galleryPhoto(fields) {
  const key = String(fields?.key ?? "").trim();
  const asset = String(fields?.asset ?? "").trim();
  if (!key || !parseImageAssetId(asset)) return null;
  const menu = menuOf(fields?.menu);
  return {
    key,
    asset,
    description: descriptionOf(fields?.description),
    menu: /** @type {PhotoMenu} */ (PHOTO_MENUS.includes(menu) ? menu : ""),
    added: String(fields?.added ?? ""),
    addedBy: String(fields?.addedBy ?? ""),
  };
}

/**
 * What's wrong with a photo's words, in words; empty when they're fine.
 * @param {{ description?: unknown, menu?: unknown }} changes
 * @returns {Partial<Record<"description" | "menu", string>>}
 */
export function galleryPhotoProblems(changes) {
  /** @type {Partial<Record<"description" | "menu", string>>} */
  const problems = {};
  if (changes.description !== undefined) {
    const description = descriptionOf(changes.description);
    if (description.length > DESCRIPTION_MAX_LENGTH) {
      problems.description = `Keep it to a line, ${DESCRIPTION_MAX_LENGTH} characters at most (it's ${description.length}).`;
    }
  }
  if (changes.menu !== undefined) {
    const menu = menuOf(changes.menu);
    if (menu && !PHOTO_MENUS.includes(menu)) problems.menu = "Pick the Drinks board, the Food board, or neither.";
  }
  return problems;
}

/**
 * The changes to a photo's words, checked: `description` and `menu`, either
 * may be left out. Throws a 400 naming each problem.
 * @returns {{ description?: string, menu?: PhotoMenu }}
 */
export function assertValidPhotoChanges(changes) {
  const problems = galleryPhotoProblems(changes || {});
  const entries = Object.entries(problems);
  if (entries.length) {
    const labels = { description: "Description", menu: "Menu board" };
    const error = new Error(entries.map(([key, message]) => `${labels[key]}: ${message}`).join(" "));
    /** @type {any} */ (error).status = 400;
    /** @type {any} */ (error).problems = problems;
    throw error;
  }
  return {
    ...(changes.description !== undefined ? { description: descriptionOf(changes.description) } : {}),
    ...(changes.menu !== undefined ? { menu: /** @type {PhotoMenu} */ (menuOf(changes.menu)) } : {}),
  };
}

/**
 * A new order for the gallery: every photo's key, once. Anything else (a
 * photo missing, one twice, one the gallery hasn't got) means the page was
 * out of date: a 409 asks for a reload rather than guessing.
 * @param {string[]} current the keys in the gallery now
 * @param {unknown} order the keys in their new order
 * @returns {string[]}
 */
export function assertWholeOrder(current, order) {
  const keys = Array.isArray(order) ? order.map((key) => String(key ?? "").trim()) : [];
  const same =
    keys.length === current.length && new Set(keys).size === keys.length && keys.every((key) => current.includes(key));
  if (!same) {
    const error = new Error("The gallery has changed since this page loaded. Reload it and try again.");
    /** @type {any} */ (error).status = 409;
    throw error;
  }
  return keys;
}

/**
 * The keys with `key` moved to `index` (0 is first), the rest in their
 * order. An unknown key leaves them as they are.
 * @param {string[]} keys
 * @param {string} key
 * @param {number} index
 */
export function moveKey(keys, key, index) {
  const from = keys.indexOf(key);
  if (from < 0) return [...keys];
  const rest = keys.filter((k) => k !== key);
  const to = Math.max(0, Math.min(rest.length, Math.round(Number(index) || 0)));
  return [...rest.slice(0, to), key, ...rest.slice(to)];
}
