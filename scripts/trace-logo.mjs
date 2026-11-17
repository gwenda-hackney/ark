#!/usr/bin/env node
/**
 * The bottle logo's brand masters (#320), traced from the site's bottle.png
 * into marketing/brand/logos/:
 *
 *   gwenda-bottle.svg          the full logo: bottle, record and GWENDA
 *   gwenda-bottle-record.svg   the bottle and record alone, for Instagram
 *   <name>-1080-black.png      each as a 1080x1080 post, centred on our black
 *   <name>-1080-transparent.png  and on transparent
 *
 * The drawing is three flat inks on black: cream, mustard and a red drip.
 * Black and transparent are both left out, so whatever is behind shows
 * through. It is traced as three stacked layers:
 *
 *   1. cream: everything light, the whole drawing's silhouette. It is traced
 *      from the PNG's brightness, not from a colour pick, so its edges keep
 *      the PNG's anti-aliasing: the record's thinnest grooves stay grooves.
 *   2. mustard and 3. red, on top: the pixels whose hue is that ink's, inside
 *      the silhouette. Edge pixels darkening to black keep their hue but
 *      fall outside the silhouette, so they make no coloured specks.
 *
 * Each layer is drawn at 2x with a light blur before potrace, for smooth
 * curves; specks under SPECK_PX are dropped. Each ink's colour is the median
 * of its own clearly-inked pixels in the PNG. svgo then shrinks the result.
 *
 * Run when bottle.png changes:
 *   npm run brand:logo
 */
import { mkdirSync, statSync, writeFileSync } from "node:fs";
import potrace from "potrace";
import sharp from "sharp";
import { optimize } from "svgo";

const src = new URL(
  "../marketing/web/src/assets/images/logos/bottle.png",
  import.meta.url,
).pathname;
const outDir = new URL("../marketing/brand/logos/", import.meta.url).pathname;

/** Traced at this multiple of the PNG, for smoother curves. */
const SCALE = 2;
/** The blur at SCALE before tracing: softens the PNG's pixel steps. */
const BLUR = 0.6;
/** Islands smaller than this, in PNG pixels, are specks and dropped. */
const SPECK_PX = 2;
/** potrace's curve fitting: higher is fewer, looser curves. */
const OPT_TOLERANCE = 0.3;
/**
 * Brightness (0–255) where the cream ends and the black begins: above the
 * middle, so the letters' thin scratches stay open.
 */
const SILHOUETTE = 150;
/** Brightness a mustard or cream pixel needs to count as that ink. */
const INK_MIN = 110;
/** The red's brightest channel at least this: darker red is shading. */
const RED_MIN = 120;

/**
 * The bottle and record without GWENDA: everything below DRIP_CUT (in PNG
 * pixels) goes, and each stream of cream crossing it ends in a rounded drip,
 * like the drips elsewhere in the logo, rather than a flat cut. The record and
 * the bottle sit wholly above it.
 */
const DRIP_CUT = 512;
/** A drip's end is this many times its width long, up to DRIP_MAX px. */
const DRIP_LENGTH = 0.75;
const DRIP_MAX = 34;
const DRIP_VARY = [1, 1.35, 0.8, 1.15, 0.9, 1.5, 1.05];

/** Instagram's square, the art's longest side in it, and our black. */
const POST = 1080;
const POST_ART = 920;
const BLACK = "#0b0a08";

/**
 * The inks by hue: each one's colour with its brightness taken out (divided
 * by its brightest channel), so a darker pixel of the same ink still matches.
 */
const HUES = {
  cream: [1, 0.95, 0.8],
  mustard: [1, 0.75, 0.35],
  red: [1, 0.16, 0.17],
};
const INKS = Object.keys(HUES);

const { data, info } = await sharp(src)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
const { width, height } = info;
const pixels = width * height;

/** Brightness over black, 0–255: transparent counts as black. */
const lightness = Buffer.alloc(pixels);
/** Each pixel's ink by hue, or null where it is black or see-through. */
const inkOf = new Array(pixels).fill(null);

for (let p = 0, i = 0; p < pixels; p++, i += 4) {
  const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
  lightness[p] = Math.round((lum * a) / 255);
  const top = Math.max(r, g, b);
  // The red is as dark as the black is by brightness: it counts by its hue
  if (a < 128 || top < RED_MIN) continue;
  const hue = [r / top, g / top, b / top];
  let best = null;
  let bestDistance = Infinity;
  for (const [name, ink] of Object.entries(HUES)) {
    const distance = hue.reduce((sum, c, k) => sum + (c - ink[k]) ** 2, 0);
    if (distance < bestDistance) [best, bestDistance] = [name, distance];
  }
  if (best === "red" || lightness[p] >= INK_MIN) inkOf[p] = best;
}

/** The median colour of an ink's fully opaque, bright pixels, as hex. */
function sampleInk(name) {
  const channels = [[], [], []];
  for (let p = 0, i = 0; p < pixels; p++, i += 4) {
    if (inkOf[p] !== name || data[i + 3] < 255) continue;
    const top = Math.max(data[i], data[i + 1], data[i + 2]);
    if (top < { cream: 220, mustard: 180, red: 160 }[name]) continue;
    for (let k = 0; k < 3; k++) channels[k].push(data[i + k]);
  }
  return `#${channels
    .map((values) => {
      values.sort((x, y) => x - y);
      return values[values.length >> 1].toString(16).padStart(2, "0");
    })
    .join("")}`;
}

/** A layer's path data: potrace of a 0–255 mask (255 is ink). */
async function trace(mask) {
  const png = await sharp(mask, { raw: { width, height, channels: 1 } })
    .resize(width * SCALE, height * SCALE, { kernel: "lanczos3" })
    .blur(BLUR)
    .negate()
    .png()
    .toBuffer();
  const svg = await new Promise((resolve, reject) =>
    potrace.trace(
      png,
      {
        threshold: 128,
        turdSize: SPECK_PX * SCALE * SCALE,
        optTolerance: OPT_TOLERANCE,
      },
      (error, result) => (error ? reject(error) : resolve(result)),
    ),
  );
  return svg.match(/ d="([^"]*)"/)?.[1] ?? "";
}

const inkMask = (name) => {
  const mask = Buffer.alloc(pixels);
  for (let p = 0; p < pixels; p++) mask[p] = inkOf[p] === name ? 255 : 0;
  return mask;
};

/**
 * The silhouette, with SILHOUETTE moved to the middle of the range so that
 * potrace's threshold falls on it and the blur stays proportional.
 */
const silhouette = Buffer.alloc(pixels);
for (let p = 0; p < pixels; p++) {
  const v = lightness[p];
  silhouette[p] =
    v < SILHOUETTE
      ? Math.round((v / SILHOUETTE) * 128)
      : Math.round(128 + ((v - SILHOUETTE) / (255 - SILHOUETTE)) * 127);
}

/** A mask with GWENDA cut away and rounded drip ends where it was cut. */
async function withoutWordmark(mask) {
  const cut = Buffer.from(mask);
  cut.fill(0, DRIP_CUT * width);
  // The streams crossing the cut, as runs of the row just above it
  const row = DRIP_CUT - 1;
  const ends = [];
  for (let x = 0; x < width;) {
    if (mask[row * width + x] < 128) {
      x += 1;
      continue;
    }
    const from = x;
    while (x < width && mask[row * width + x] >= 128) x += 1;
    if (x - from >= 3) ends.push([from, x]);
  }
  // Each end a half ellipse under the cut, anti-aliased like the PNG
  const drips = ends
    .map(([from, to], index) => {
      const rx = (to - from) / 2;
      // Lengths vary a little, so the ends hang like drips, not a fringe
      const vary = DRIP_VARY[index % DRIP_VARY.length];
      const ry = Math.min(DRIP_MAX, (to - from) * DRIP_LENGTH) * vary;
      return `<path d="M${from} ${row}V${DRIP_CUT}A${rx} ${ry} 0 0 0 ${to} ${DRIP_CUT}V${row}Z"/>`;
    })
    .join("");
  const caps = await sharp(
    Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%"/><g fill="#fff">${drips}</g></svg>`,
    ),
  )
    .extractChannel(0)
    .raw()
    .toBuffer();
  for (let p = 0; p < pixels; p++) cut[p] = Math.max(cut[p], caps[p]);
  return cut;
}

/** The smallest box around some masks' ink, in PNG pixels, padded. */
function artBox(masks, pad = 8) {
  let [x0, y0, x1, y1] = [width, height, 0, 0];
  for (const mask of masks)
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++)
        if (mask[y * width + x] >= 128) {
          x0 = Math.min(x0, x);
          y0 = Math.min(y0, y);
          x1 = Math.max(x1, x + 1);
          y1 = Math.max(y1, y + 1);
        }
  x0 = Math.max(0, x0 - pad);
  y0 = Math.max(0, y0 - pad);
  x1 = Math.min(width, x1 + pad);
  y1 = Math.min(height, y1 + pad);
  return [x0, y0, x1 - x0, y1 - y0];
}

const inks = Object.fromEntries(INKS.map((name) => [name, sampleInk(name)]));

/** One SVG: the layers, over the box around their art, through svgo. */
async function logo(masks) {
  const [x, y, w, h] = artBox(masks);
  const paths = [];
  for (const [index, name] of INKS.entries()) {
    const d = await trace(masks[index]);
    if (d)
      paths.push(`<path fill="${inks[name]}" fill-rule="evenodd" d="${d}"/>`);
  }
  const raw = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x * SCALE} ${y * SCALE} ${w * SCALE} ${h * SCALE}" width="${w}" height="${h}">${paths.join("")}</svg>`;
  return optimize(raw, {
    multipass: true,
    floatPrecision: 0,
    plugins: ["preset-default"],
  }).data;
}

const report = (file) =>
  console.log(`${file}: ${(statSync(file).size / 1024).toFixed(0)} KB`);

/** The art centred on Instagram's square, on our black and on transparent. */
async function writePosts(name, svg) {
  const art = await sharp(Buffer.from(svg), { density: 300 })
    .resize(POST_ART, POST_ART, { fit: "inside" })
    .png()
    .toBuffer();
  for (const [suffix, background] of [
    ["black", BLACK],
    ["transparent", { r: 0, g: 0, b: 0, alpha: 0 }],
  ]) {
    const file = `${outDir}${name}-1080-${suffix}.png`;
    await sharp({
      create: { width: POST, height: POST, channels: 4, background },
    })
      .composite([{ input: art, gravity: "centre" }])
      .png({ compressionLevel: 9 })
      .toFile(file);
    report(file);
  }
}

mkdirSync(outDir, { recursive: true });
const full = [silhouette, inkMask("mustard"), inkMask("red")];
const bottleOnly = await Promise.all(full.map(withoutWordmark));

for (const [name, masks] of [
  ["gwenda-bottle", full],
  ["gwenda-bottle-record", bottleOnly],
]) {
  const svg = await logo(masks);
  const file = `${outDir}${name}.svg`;
  writeFileSync(file, svg);
  report(file);
  await writePosts(name, svg);
}
console.log(`inks: ${Object.values(inks).join(" ")}`);
