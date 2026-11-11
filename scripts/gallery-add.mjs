#!/usr/bin/env node
/**
 * Add a photo to the website's gallery (home's Photos and /photos): converts
 * it to WebP, 1600px on the long edge and under 400KB, into
 * marketing/web/src/assets/images/gallery/, and lists it first in
 * marketing/web/src/data/photos.json. The original stays where it is.
 *
 *   npm run gallery:add -- --alt "Two burgers on the pass" ~/Downloads/IMG_0042.jpg
 *   npm run gallery:add -- --alt "..." --name burgers-on-the-pass photo.jpg
 *   npm run gallery:add -- --alt "..." --link https://www.instagram.com/p/abc/ photo.jpg
 *
 * --alt says what the photo shows (read out by screen readers; required).
 * --name sets the file name; otherwise the input's name is slugged.
 * --link records where the photo was posted. Adding the same name again
 * replaces the photo and moves it to the front.
 */
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { addPhoto, photoSlug } from "../marketing/web/src/lib/photos.js";

const web = (path) =>
  fileURLToPath(new URL(`../marketing/web/src/${path}`, import.meta.url));
const GALLERY_DIR = web("assets/images/gallery/");
const LIST = web("data/photos.json");
const MAX_EDGE = 1600;
const MAX_BYTES = 400 * 1024;

const args = process.argv.slice(2);
const options = {};
const inputs = [];
for (let i = 0; i < args.length; i += 1) {
  const flag = /^--(alt|name|link)$/.exec(args[i]);
  if (flag) options[flag[1]] = args[++i];
  else inputs.push(args[i]);
}
if (inputs.length !== 1 || !options.alt?.trim()) {
  console.error(
    'Usage: npm run gallery:add -- --alt "what it shows" [--name <slug>] [--link <url>] <image>',
  );
  process.exit(1);
}

let sharp;
try {
  ({ default: sharp } = await import("sharp"));
} catch {
  console.error("sharp is not installed; run npm ci first.");
  process.exit(1);
}

const [input] = inputs;
const slug = photoSlug(options.name || input);
if (!slug) {
  console.error("That name has no letters or numbers in it; pass --name.");
  process.exit(1);
}
mkdirSync(GALLERY_DIR, { recursive: true });
const out = join(GALLERY_DIR, `${slug}.webp`);
// Quality steps down until the file fits the cap; phone photos usually fit at the first.
let quality = 76;
let bytes;
for (;;) {
  await sharp(input)
    .rotate()
    .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: "inside", withoutEnlargement: true })
    .webp({ quality })
    .toFile(out);
  bytes = statSync(out).size;
  if (bytes <= MAX_BYTES || quality <= 44) break;
  quality -= 8;
}

const list = JSON.parse(readFileSync(LIST, "utf8"));
const next = addPhoto(list, {
  file: `gallery/${slug}.webp`,
  alt: options.alt,
  link: options.link,
});
writeFileSync(LIST, `${JSON.stringify(next, null, 2)}\n`);

const { width, height } = await sharp(out).metadata();
console.log(`${out}  ${width}x${height}  ${Math.round(bytes / 1024)}KB  q${quality}`);
if (Math.max(width, height) < 800) {
  console.warn(
    `Small photo (${width}x${height}): it will look soft on the wall. Send the original if there is one (WhatsApp: send as a document).`,
  );
}
console.log(`Listed first in ${LIST} (${next.length} photos).`);
