/**
 * The photo gallery (#240): which photos show, in what order, and how many
 * on home. The list is src/data/photos.json, newest first; where the files
 * themselves come from is lib/photo-sources.ts and nowhere else.
 */

/** Home shows this many; the rest are on /photos. */
export const HOME_PHOTOS = 8;

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
      image,
      ratio: Math.round((image.width / image.height) * 1000) / 1000,
    });
  }
  return photos;
}

/**
 * Home's share: the first few, and how many more there are on /photos.
 *
 * @template T
 * @param {T[]} photos
 */
export function homePhotos(photos, limit = HOME_PHOTOS) {
  const shown = photos.slice(0, limit);
  return { photos: shown, more: photos.length - shown.length };
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
 * @param {Array<{ file: string, alt: string, link?: string }>} list
 * @param {{ file: string, alt: string, link?: string }} entry
 */
export function addPhoto(list, entry) {
  const file = String(entry?.file || "").trim();
  const alt = String(entry?.alt || "").trim();
  if (!file) throw new Error("A photo needs a file.");
  if (!alt) throw new Error("A photo needs a line saying what it shows.");
  const added = { file, alt };
  if (entry.link) added.link = String(entry.link).trim();
  return [added, ...(list || []).filter((item) => item.file !== file)];
}
