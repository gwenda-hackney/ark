#!/usr/bin/env node
/**
 * Put reference images (renders, logo concepts, food and room photos) into
 * docs/brand/ as WebP, 1600px on the long edge, so the originals never land
 * in git. Keeps the input file where it is.
 *
 *   npm run brand:add -- "~/Downloads/render.png" photo.jpg
 *   npm run brand:add -- --name render-tavern "~/Downloads/1.png"
 *
 * --name sets the output name (one input only); otherwise the input's name is
 * slugged. Existing files are overwritten, so renaming a concept is a re-add.
 */
import { mkdirSync, statSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { BRAND_DIR, MAX_BYTES, MAX_EDGE } from "./lib/brand-images.mjs";

let sharp;
try {
  ({ default: sharp } = await import("sharp"));
} catch {
  console.error("sharp is not installed; run npm ci first.");
  process.exit(1);
}

const args = process.argv.slice(2);
let name;
const inputs = [];
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === "--name") name = args[++i];
  else inputs.push(args[i]);
}
if (inputs.length === 0 || (name && inputs.length > 1)) {
  console.error("Usage: npm run brand:add -- [--name <slug>] <image> [more images]");
  process.exit(1);
}

const slug = (file) =>
  basename(file, extname(file))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

mkdirSync(BRAND_DIR, { recursive: true });
for (const input of inputs) {
  const out = join(BRAND_DIR, `${name ?? slug(input)}.webp`);
  // Quality steps down until the file fits the cap; phone photos usually fit at the first.
  let quality = 72;
  let bytes;
  for (;;) {
    await sharp(input)
      .rotate()
      .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: "inside", withoutEnlargement: true })
      .webp({ quality })
      .toFile(out);
    bytes = statSync(out).size;
    if (bytes <= MAX_BYTES || quality <= 40) break;
    quality -= 8;
  }
  console.log(`${out}  ${Math.round(bytes / 1024)}KB  q${quality}`);
}
