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
 * What makes two photos the same picture: the file it is built from (`src`),
 * its address (`url`, a photo from ops), and the hash of its bytes (`hash`),
 * which a venue photo and the same picture uploaded in ops share
 * (lib/photo-sources.ts works them out).
 *
 * @param {{ image?: { src?: string }, url?: string, hash?: string }} photo
 */
function photoKeys(photo) {
  return [photo?.image?.src, photo?.url, photo?.hash].filter(Boolean);
}

/** Whether `photo` is one of the pictures in `keys` (photoKeys). */
function isAmong(photo, keys) {
  return photoKeys(photo).some((key) => keys.has(key));
}

/** A photo from ops that has a picture to show. */
function hasPicture(photo) {
  return Boolean(photo?.url) && photo.width > 0 && photo.height > 0;
}

/**
 * Home's share: the newest few, leaving out any that home already shows
 * somewhere else (the menu boards' snapshots), so no photo is on it twice;
 * and how many more there are on /photos.
 *
 * @template {{ image?: { src?: string } }} T
 * @param {T[]} photos newest first
 * @param {{ limit?: number, shownElsewhere?: string[] }} [options]
 *   `shownElsewhere`: the pictures home shows already (photoKeys: a file's
 *   `src`, an address, a hash)
 */
export function homePhotos(
  photos,
  { limit = HOME_PHOTOS, shownElsewhere = [] } = {},
) {
  const elsewhere = new Set(shownElsewhere.filter(Boolean));
  const shown = photos
    .filter((photo) => !isAmong(photo, elsewhere))
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
 * The Food board's prints: the pop-up kitchen's own gallery (the one cooking
 * now or next, lib/popup-kitchen.js), newest first. When it has fewer than
 * the board holds, the photos marked food top it up; with no pop-up, or
 * nothing in its gallery, the board has those as before. The same picture is
 * never up twice.
 *
 * @param {Array<object>} photos the venue photos, newest first (listPhotos)
 * @param {Array<{ url: string, width: number, height: number }>} kitchen
 *   the pop-up's gallery photos, newest first
 * @param {{ limit?: number }} [options]
 */
export function foodBoardPhotos(
  photos,
  kitchen = [],
  { limit = MENU_BOARD_PHOTOS } = {},
) {
  const own = [];
  const up = new Set();
  for (const photo of kitchen || []) {
    if (own.length >= limit) break;
    if (!hasPicture(photo) || isAmong(photo, up)) continue;
    own.push(photo);
    for (const key of photoKeys(photo)) up.add(key);
  }
  const rest = (photos || []).filter((photo) => !isAmong(photo, up));
  return [...own, ...menuPhotos(rest, "food", { limit: limit - own.length })];
}

/**
 * The prints on home's Bookings (HomeBookings.astro), one on each half, by
 * file: the terrace at dusk, its round tables, by Book a table; the terrace
 * lit up at night by Have a party.
 */
export const BOOKINGS_PHOTOS = {
  table: "gallery/terrace-at-dusk.webp",
  party: "gallery/terrace-at-night.webp",
};

/**
 * Who gets which photo on home, decided here once: Bookings has its two
 * (BOOKINGS_PHOTOS, each null when its file isn't listed), the menu boards
 * pick from the rest (the newest marked for each, so a photo just added for
 * one goes straight up on it; the Food board takes the pop-up kitchen's own
 * first, foodBoardPhotos), then the photo row takes the newest of what's
 * left. No picture is on home twice; every venue photo is still on /photos
 * (`more`: how many the row leaves for there).
 *
 * @template {{ file?: string, menu?: string, image?: { src?: string } }} T
 * @param {T[]} photos newest first (listPhotos)
 * @param {{ kitchen?: Array<{ url: string, width: number, height: number }> }} [options]
 *   `kitchen`: the pop-up kitchen's gallery photos, newest first
 * @returns {{ bookings: { table: T | null, party: T | null }, drinks: T[], food: Array<object>, row: T[], more: number }}
 */
export function homePhotoPlan(photos, { kitchen = [] } = {}) {
  const all = photos || [];
  const pick = (file) => all.find((photo) => photo?.file === file) ?? null;
  const bookings = {
    table: pick(BOOKINGS_PHOTOS.table),
    party: pick(BOOKINGS_PHOTOS.party),
  };
  const pinned = new Set(
    Object.values(bookings).filter(Boolean).flatMap(photoKeys),
  );
  const rest = all.filter((photo) => !isAmong(photo, pinned));
  const drinks = menuPhotos(rest, "drinks");
  const food = foodBoardPhotos(rest, kitchen);
  const { photos: row, more } = homePhotos(all, {
    shownElsewhere: [...pinned, ...[...drinks, ...food].flatMap(photoKeys)],
  });
  return { bookings, drinks, food, row, more };
}

/**
 * /photos shows each event's newest few; the rest are on the event's own
 * page. Two rows of three on a desk, so one big night can't take the page.
 */
export const EVENT_PHOTOS_PER_EVENT = 6;

/**
 * An event photo smaller than this on its long side would show soft in a
 * column of /photos (about 380px across, sharp at 2x): it stays on the
 * event's page only.
 */
export const EVENT_PHOTO_MIN = 800;

/** /photos shows the newest few events; older ones keep their own pages. */
export const EVENT_PHOTO_EVENTS = 8;

/**
 * The photos from events on /photos, under the venue's own: each event's
 * gallery from ops, under its name, the event with the newest photo first,
 * the newest few events (EVENT_PHOTO_EVENTS). Each shows its newest few
 * photos (`more`: how many it leaves for its own page);
 * one too small to show sharp is left out; a picture already on the page
 * (`shownElsewhere`, photoKeys) or on another event's shows once.
 *
 * @template {{ url: string, width: number, height: number, added?: string }} P
 * @param {Array<{ id: string, title: string, href?: string, photos: P[] }>} events
 *   each event's photos newest first; `href` its page, while it has one
 * @param {{ perEvent?: number, min?: number, limit?: number, shownElsewhere?: string[] }} [options]
 * @returns {Array<{ id: string, title: string, href?: string, photos: P[], more: number }>}
 */
export function eventPhotoGroups(
  events,
  {
    perEvent = EVENT_PHOTOS_PER_EVENT,
    min = EVENT_PHOTO_MIN,
    limit = EVENT_PHOTO_EVENTS,
    shownElsewhere = [],
  } = {},
) {
  const newest = (event) =>
    (event.photos || [])
      .map((photo) => String(photo?.added || ""))
      .sort()
      .at(-1) || "";
  const seen = new Set(shownElsewhere.filter(Boolean));
  const groups = [];
  const byNewest = (Array.isArray(events) ? events : [])
    .filter((event) => event?.id && event.title)
    .sort((a, b) => newest(b).localeCompare(newest(a)));
  for (const event of byNewest) {
    if (groups.length >= limit) break;
    const photos = [];
    for (const photo of event.photos || []) {
      if (!hasPicture(photo) || isAmong(photo, seen)) continue;
      if (Math.max(photo.width, photo.height) < min) continue;
      photos.push(photo);
      for (const key of photoKeys(photo)) seen.add(key);
    }
    if (!photos.length) continue;
    groups.push({
      ...event,
      photos: photos.slice(0, perEvent),
      more: Math.max(0, photos.length - perEvent),
    });
  }
  return groups;
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
