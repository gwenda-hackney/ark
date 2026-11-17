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
 * The bottle and record without GWENDA. The record is finished as a whole
 * disc, an ellipse in PNG pixels: its hidden front half is drawn here, and
 * everything of the PNG below its rim (the wordmark) goes.
 */
const RECORD = { cx: 362, cy: 455, rx: 300, ry: 110 };
/**
 * Where the art ends off the record: the left-hand melt (left of MELT_TO px)
 * and, right of the record, just under the bottle's lower edge (the line
 * through two points on it), so the liquid that ran on to GWENDA goes.
 */
const MELT_TO = 102;
const LEFT_END = 540;
const BOTTLE_EDGE = [
  [550, 310],
  [830, 475],
];
const UNDER_BOTTLE = 12;
/** The rim: a cream edge around the front half, this thick at its middle. */
const RIM = 5;
/**
 * The grooves on the front half, cream arcs like the ones behind: each a
 * fraction of the record's size, from and to an angle (degrees, 0 is the
 * right-hand end, 90 the front), and its thickness at its middle.
 */
const GROOVES = [
  [0.56, 30, 150, 3],
  [0.66, 20, 160, 4],
  [0.76, 35, 140, 3.5],
  [0.86, 15, 165, 4],
];
/**
 * The pour spreads over the front of the record as a pool, from and to an
 * angle, reaching in from the rim by up to POOL_DEPTH of the record's size.
 * The streams that ran down to GWENDA end in it.
 */
const POOL = { from: 8, to: 118, depth: 0.42 };
/** Drips over the rim from the pool: [angle, width, length] in px. */
const POOL_DRIPS = [
  [24, 13, 20],
  [47, 16, 32],
  [72, 12, 16],
  [96, 15, 26],
];
/** The left-hand melt's one long drip, and the drips under the bottle. */
const MELT_DRIP = 2.2;
const END_DRIP = 1.2;

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

/** Where the bottle-and-record art ends at column x: the rim, or either end. */
function artEnd(x) {
  const { cx, cy, rx, ry } = RECORD;
  const u = (x - cx) / rx;
  if (x < MELT_TO) return LEFT_END;
  if (Math.abs(u) <= 1) return cy + ry * Math.sqrt(1 - u * u);
  const [[x0, y0], [x1, y1]] = BOTTLE_EDGE;
  return y0 + ((x - x0) * (y1 - y0)) / (x1 - x0) + UNDER_BOTTLE;
}

/** A point on the record's ellipse scaled by f, at an angle in degrees. */
function onRecord(f, degrees) {
  const { cx, cy, rx, ry } = RECORD;
  const a = (degrees * Math.PI) / 180;
  return [cx + rx * f * Math.cos(a), cy + ry * f * Math.sin(a)];
}

/**
 * A crescent along the record's ellipse at scale f, from one angle to
 * another, `thick` px at its middle and tapering to nothing at both ends:
 * the way the PNG draws its grooves.
 */
function crescent(f, from, to, thick) {
  const steps = 48;
  const outer = [];
  const inner = [];
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const angle = from + (to - from) * t;
    const half = (thick / 2) * Math.sin(Math.PI * t);
    const [x, y] = onRecord(f, angle);
    // Normal to the ellipse, for an even thickness all the way round
    const a = (angle * Math.PI) / 180;
    const [nx, ny] = [RECORD.ry * Math.cos(a), RECORD.rx * Math.sin(a)];
    const n = Math.hypot(nx, ny);
    outer.push([x + (nx / n) * half, y + (ny / n) * half]);
    inner.push([x - (nx / n) * half, y - (ny / n) * half]);
  }
  const points = [...outer, ...inner.reverse()];
  return `<path d="M${points.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join("L")}Z"/>`;
}

/** A polygon's path data. */
const polygon = (points) =>
  `<path d="M${points.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join("L")}Z"/>`;

/** A drip hanging from the art's end: a neck of `w` px and a round end. */
function drip(mid, w, length) {
  const top = artEnd(mid) - 4;
  const r = w / 2;
  const bulb = top + 4 + length - r;
  // A neck a little narrower than its end, flaring where it leaves the edge
  return `${polygon([
    [mid - r * 1.4, top],
    [mid + r * 1.4, top],
    [mid + r * 0.75, top + 6],
    [mid + r * 0.75, bulb],
    [mid - r * 0.75, bulb],
    [mid - r * 0.75, top + 6],
  ])}<circle cx="${mid}" cy="${bulb}" r="${r}"/>`;
}

/**
 * The pool of pour over the record's front: from the rim inwards, deepest in
 * the middle and gently wavy on its inner edge, like a spreading liquid.
 */
function pool() {
  const { from, to, depth } = POOL;
  const outer = [];
  const inner = [];
  const steps = 64;
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const angle = from + (to - from) * t;
    const reach =
      depth * Math.sin(Math.PI * t) ** 0.6 * (1 + 0.18 * Math.sin(t * 17));
    outer.push(onRecord(1.01, angle));
    inner.push(onRecord(1 - reach, angle));
  }
  return polygon([...outer, ...inner.reverse()]);
}

/**
 * The bottle and record without GWENDA, as [cream, mustard, red] masks:
 * the PNG down to the record's rim, the record's front half drawn in (rim and
 * grooves), and the pour that reaches the rim dripping over it.
 */
async function bottleAndRecord([cream, mustard, red]) {
  const clip = (mask) => {
    const out = Buffer.from(mask);
    for (let x = 0; x < width; x++)
      for (let y = Math.ceil(artEnd(x)); y < height; y++)
        out[y * width + x] = 0;
    return out;
  };
  const kept = clip(cream);

  // The cream reaching the art's end, as runs of columns just above it
  const runs = [];
  for (let x = 0; x < width;) {
    const at = (column) =>
      kept[Math.floor(artEnd(column) - 2) * width + column] >= 128;
    if (!at(x)) {
      x += 1;
      continue;
    }
    const from = x;
    while (x < width && at(x)) x += 1;
    if (x - from >= 4) runs.push([from, x]);
  }
  // Off the record, each end of the art drips once: the melt on the left is
  // rounded off and hangs a long drip; under the bottle, a short one. On the
  // record the rim takes the streams, and the pool drips over it.
  const drips = [];
  const { cx, rx } = RECORD;
  for (const [from, to] of runs) {
    if (from >= MELT_TO && to <= cx + rx) continue;
    const w = to - from;
    const mid = (from + to) / 2;
    if (to <= MELT_TO) {
      const neck = Math.min(w * 0.45, 18);
      const cap = Math.min(w * 0.35, 16);
      drips.push(
        `<ellipse cx="${mid}" cy="${artEnd(mid) - 2}" rx="${w / 2}" ry="${cap}"/>`,
        drip(mid, neck, cap + neck * MELT_DRIP),
      );
    } else {
      const neck = Math.min(w * 0.4, 12);
      drips.push(drip(mid, neck, neck * END_DRIP));
    }
  }
  for (const [angle, w, length] of POOL_DRIPS)
    drips.push(drip(onRecord(1, angle)[0], w, length));

  const front = [
    crescent(1, 0, 180, RIM * 2),
    ...GROOVES.map(([f, from, to, thick]) => crescent(f, from, to, thick)),
    pool(),
    ...drips,
  ].join("");
  const drawn = await sharp(
    Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%"/><g fill="#fff">${front}</g></svg>`,
    ),
  )
    .extractChannel(0)
    .raw()
    .toBuffer();
  // Drawn grooves stay off the label
  const label = mustard;
  for (let p = 0; p < pixels; p++)
    kept[p] = Math.max(kept[p], label[p] >= 128 ? 0 : drawn[p]);
  return [kept, clip(mustard), clip(red)];
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
const bottleOnly = await bottleAndRecord(full);

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
