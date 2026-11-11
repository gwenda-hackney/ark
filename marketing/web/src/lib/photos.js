/**
 * The photo gallery (#240): which photos show, in what order, and how many
 * on home. The list is src/data/photos.json, newest first; where the files
 * themselves come from is lib/photo-sources.ts and nowhere else.
 */

/**
 * Home's photo rows show this many after the menu boards have theirs: two
 * rows of four on a desk (of three on a tablet, of two on a phone, which
 * show the first six and four). The rest are on /photos.
 */
export const HOME_PHOTOS = 8;

/**
 * The menu boards on home a photo can be pinned up on (HomeMenu): an entry's
 * optional `menu` says which, by what the photo shows.
 */
export const PHOTO_MENUS = ["drinks", "food"];

/** Each menu board on home pins up this many, overlapping like prints on a board. */
export const MENU_BOARD_PHOTOS = 2;

/**
 * The photos to show, in the list's order. An entry whose file is missing is
 * left out rather than breaking the page; a file listed twice shows once.
 *
 * @param {Array<{ file?: string, alt?: string, link?: string }>} list
 * @param {Record<string, { src: string, width: number, height: number }>} files
 *   image files by their path under src/assets/images/
 */
export function listPhotos(list, files) {
  const seen = new Set();
  const photos = [];
  for (const entry of Array.isArray(list) ? list : []) {
    const file = String(entry?.file || "").trim();
    const image = files?.[file];
    if (!file || seen.has(file)) continue;
    if (!image || !(image.width > 0) || !(image.height > 0)) continue;
    seen.add(file);
    photos.push({
      file,
      alt: String(entry.alt || "").trim(),
      link: String(entry.link || "").trim(),
      menu: PHOTO_MENUS.includes(entry.menu) ? entry.menu : "",
      image,
      ratio: Math.round((image.width / image.height) * 1000) / 1000,
    });
  }
  return photos;
}

/**
 * Home's share: the newest few, leaving out any that home already shows
 * somewhere else (the menu boards' snapshots), so no photo is on it twice;
 * and how many more there are on /photos.
 *
 * @template {{ image?: { src?: string } }} T
 * @param {T[]} photos newest first
 * @param {{ limit?: number, shownElsewhere?: string[] }} [options]
 *   `shownElsewhere`: the image files (their `src`) home shows already
 */
export function homePhotos(
  photos,
  { limit = HOME_PHOTOS, shownElsewhere = [] } = {},
) {
  const elsewhere = new Set(shownElsewhere.filter(Boolean));
  const shown = photos
    .filter((photo) => !elsewhere.has(photo?.image?.src))
    .slice(0, limit);
  return { photos: shown, more: photos.length - shown.length };
}

/**
 * A menu board's photos (the snapshots pinned up on home's Drinks or Food):
 * the ones marked for it, newest first.
 *
 * @template {{ menu?: string }} T
 * @param {T[]} photos newest first
 * @param {string} menu "drinks" or "food" (PHOTO_MENUS)
 * @param {{ limit?: number }} [options]
 */
export function menuPhotos(photos, menu, { limit = MENU_BOARD_PHOTOS } = {}) {
  return (photos || []).filter((photo) => photo?.menu === menu).slice(0, limit);
}

/**
 * Who gets which photo on home, decided here once: the menu boards pick
 * first (the newest marked for each, so a photo just added for one goes
 * straight up on it), then the photo row takes the newest of the rest. No
 * photo is on home twice; every one is still on /photos (`more`: how many
 * the row leaves for there).
 *
 * @template {{ menu?: string, image?: { src?: string } }} T
 * @param {T[]} photos newest first (listPhotos)
 * @returns {{ drinks: T[], food: T[], row: T[], more: number }}
 */
export function homePhotoPlan(photos) {
  const drinks = menuPhotos(photos, "drinks");
  const food = menuPhotos(photos, "food");
  const { photos: row, more } = homePhotos(photos || [], {
    shownElsewhere: [...drinks, ...food].map((photo) => photo.image?.src),
  });
  return { drinks, food, row, more };
}

/** A file name from whatever a phone or WhatsApp called the photo. */
export function photoSlug(name) {
  return String(name || "")
    .replace(/\.[a-z0-9]+$/i, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * The list with a photo added at the front (newest first). Adding a file
 * that is already listed moves it to the front with its new words.
 *
 * @param {Array<{ file: string, alt: string, link?: string, menu?: string }>} list
 * @param {{ file: string, alt: string, link?: string, menu?: string }} entry
 *   `menu`: the menu board on home it can be pinned up on (PHOTO_MENUS)
 */
export function addPhoto(list, entry) {
  const file = String(entry?.file || "").trim();
  const alt = String(entry?.alt || "").trim();
  if (!file) throw new Error("A photo needs a file.");
  if (!alt) throw new Error("A photo needs a line saying what it shows.");
  if (entry.menu && !PHOTO_MENUS.includes(entry.menu)) {
    throw new Error(
      `A photo's menu board is drinks or food, not "${entry.menu}".`,
    );
  }
  const added = { file, alt };
  if (entry.link) added.link = String(entry.link).trim();
  if (entry.menu) added.menu = entry.menu;
  return [added, ...(list || []).filter((item) => item.file !== file)];
}
