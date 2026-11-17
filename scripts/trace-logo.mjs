#!/usr/bin/env node
/**
 * The bottle logo, everywhere it shows (#320), from one drawing. The original
 * raster (marketing/brand/source/bottle-original.png) is only what is traced
 * here; the masters traced from it are the logo, and every other file is
 * drawn from them:
 *
 *   marketing/brand/logos/
 *     gwenda-bottle.svg          the full logo: bottle, record and GWENDA
 *     gwenda-bottle-record.svg   the bottle and record alone, for Instagram
 *     <name>-1080-black.png      each as a 1080x1080 post, centred on our black
 *     <name>-1080-transparent.png  and on transparent
 *   marketing/web/, from the full logo less its black
 *   (scripts/lib/logo-renders.mjs)
 *     src/assets/images/logos/bottle.png           the menu's and the bar's
 *     src/assets/images/logos/bottle-hero-<w>.webp home's hero, per width
 *     public/brand/logo-email-social.png           with SOCIAL, for emails
 *
 * All of it is written here, once, and committed. Nothing is traced or drawn
 * when the site is built or deployed: when the original or a master's
 * drawing changes, run this again and commit the files it writes.
 *
 *   npm run brand:logo
 *
 * The drawing is three flat inks on black: cream, mustard and a red drip.
 * The original's black is see-through, which leaves the linework (the
 * record's grooves, the skull's eyes, the scratches in the letters) hollow
 * on a light page. The masters and their posts draw the black, so they stand
 * on any background. The website's and the emails' files are the same
 * drawing with the black layer left out, as the original was: there the
 * leather, or the email's board, shows through. Each master is four stacked
 * layers, a named group apiece for a design tool's layers:
 *
 *   1. black, at the bottom: everything inside the drawing's outer edge
 *      (backing, below). Outside it stays see-through.
 *   2. cream: everything light, the whole drawing's silhouette. It is traced
 *      from the PNG's brightness, not from a colour pick, so its edges keep
 *      the PNG's anti-aliasing: the record's thinnest grooves stay grooves.
 *   3. mustard and 4. red, on top: the pixels whose hue is that ink's, inside
 *      the silhouette. Edge pixels darkening to black keep their hue but
 *      fall outside the silhouette, so they make no coloured specks.
 *
 * Each layer is drawn at 2x with a light blur before potrace, for smooth
 * curves; specks under SPECK_PX are dropped. Each ink's colour is the median
 * of its own clearly-inked pixels in the PNG; the black is ours (the PNG has
 * none to sample). svgo then shrinks the result.
 *
 * The bottle and record alone is the same tracing with the record's front
 * redrawn: where the pour ran down into GWENDA it ends at the record, in
 * marketing/brand/source/bottle-record-front.svg (drawn by hand; see
 * bottleAndRecord, below).
 */
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import potrace from "potrace";
import sharp from "sharp";
import { optimize } from "svgo";
import { EMAIL_LOGO_PATH } from "../shared/email/shell.js";
import {
  HERO_LOGO_WIDTHS,
  emailLogo,
  heroLogo,
  post,
  siteLogo,
} from "./lib/logo-renders.mjs";

const src = new URL(
  "../marketing/brand/source/bottle-original.png",
  import.meta.url,
).pathname;
const outDir = new URL("../marketing/brand/logos/", import.meta.url).pathname;
/** The website, whose logo files are drawn from the full master. */
const site = new URL("../marketing/web/", import.meta.url).pathname;

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
 * The bottle and record without GWENDA: the front of its record, drawn by
 * hand over the original. Three groups of shapes, in the PNG's pixels, read
 * by their ids (the file says what each is for, and opens in a browser or a
 * drawing tool over the original).
 */
const front = new URL(
  "../marketing/brand/source/bottle-record-front.svg",
  import.meta.url,
).pathname;

/**
 * The drawing's black: the site's ground (--ch-bg), so a post on our black
 * and the logo's own black are one.
 */
const BLACK = "#0b0a08";
/**
 * The black fills what the inks enclose once every gap narrower than twice
 * this (PNG px) is shut: the breaks in the bottle's outline that would let
 * the outside in, and, in the full logo, the slits between the letters, so
 * GWENDA stands on one black block as it does in the drawing. The bottle and
 * record alone takes a smaller one: the air between its drips stays air.
 */
const BLACK_GAP = { "gwenda-bottle": 30, "gwenda-bottle-record": 10 };
/**
 * The black stops this far (PNG px) inside the drawing's outer edge, so no
 * dark line shows round the cream on a light page.
 */
const BLACK_INSET = 1;
/**
 * A patch of black beyond the cream, open to the outside and no deeper than
 * this share of the gap, is a fringe of shutting the gaps, not part of the
 * drawing: it is left out.
 */
const BLACK_FRINGE = 0.45;

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
/** The layers, from the bottom up. */
const LAYERS = ["black", ...INKS];

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

/**
 * One group of the hand-drawn front, by its id, as a mask at the PNG's size:
 * its shapes in white, anti-aliased like the PNG's own edges.
 */
async function handDrawn(id) {
  const shapes = readFileSync(front, "utf8").match(
    new RegExp(`<g id="${id}"[^>]*>([\\s\\S]*?)</g>`),
  )?.[1];
  if (shapes === undefined) throw new Error(`${front}: no <g id="${id}">`);
  return sharp(
    Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%"/><g fill="#fff">${shapes}</g></svg>`,
    ),
  )
    .extractChannel(0)
    .raw()
    .toBuffer();
}

/**
 * The bottle and record without GWENDA, as [cream, mustard, red] masks. In
 * the full logo the pour and the record's melting rim run down into the
 * letters; here they end at the record. The original loses what the front's
 * `erase` covers (GWENDA, and the streams below the record's rim), and gains
 * its `ink`: the pour pooling along the front rim and dripping over it.
 */
async function bottleAndRecord(inkMasks) {
  const [erase, ink] = await Promise.all(["erase", "ink"].map(handDrawn));
  const [cream, mustard, red] = inkMasks.map((mask) =>
    Buffer.from(mask.map((v, p) => Math.min(v, 255 - erase[p]))),
  );
  for (let p = 0; p < pixels; p++) cream[p] = Math.max(cream[p], ink[p]);
  return [cream, mustard, red];
}

/**
 * Each pixel's squared distance to the nearest set pixel of a w x h mask:
 * Felzenszwalb and Huttenlocher's lower envelope of parabolas, down the
 * columns and then along the rows.
 */
function distanceSquared(set, w, h) {
  const far = 1e20;
  const longest = Math.max(w, h);
  const f = new Float64Array(longest);
  const d = new Float64Array(longest);
  const v = new Int32Array(longest);
  const z = new Float64Array(longest + 1);
  const pass = (length) => {
    let k = 0;
    v[0] = 0;
    z[0] = -far;
    z[1] = far;
    for (let q = 1; q < length; q++) {
      let s;
      do {
        const p = v[k];
        s = (f[q] + q * q - (f[p] + p * p)) / (2 * q - 2 * p);
      } while (s <= z[k] && --k >= 0);
      k += 1;
      v[k] = q;
      z[k] = s;
      z[k + 1] = far;
    }
    k = 0;
    for (let q = 0; q < length; q++) {
      while (z[k + 1] < q) k += 1;
      d[q] = (q - v[k]) ** 2 + f[v[k]];
    }
  };
  const out = new Float64Array(w * h);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) f[y] = set[y * w + x] ? 0 : far;
    pass(h);
    for (let y = 0; y < h; y++) out[y * w + x] = d[y];
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) f[x] = out[y * w + x];
    pass(w);
    for (let x = 0; x < w; x++) out[y * w + x] = d[x];
  }
  return out;
}

/**
 * A flood over a w x h grid: the pixels `from` reaches through neighbours
 * (left, right, up, down) that are `open`, itself included. They are marked
 * in `reached`, which a later flood then stays out of.
 */
function flood(w, h, from, open, reached = new Uint8Array(w * h)) {
  const found = [from];
  reached[from] = 1;
  for (let at = 0; at < found.length; at++) {
    const p = found[at];
    const x = p % w;
    for (const q of [p + 1, p - 1, p + w, p - w]) {
      if (q < 0 || q >= w * h || reached[q] || !open(q)) continue;
      // Not round the end of a row
      if ((q === p + 1 && x === w - 1) || (q === p - 1 && x === 0)) continue;
      reached[q] = 1;
      found.push(q);
    }
  }
  return found;
}

/**
 * The black behind some inks, as a mask: everything inside the drawing's
 * outer edge, less BLACK_INSET.
 *
 * The air comes in from the canvas's edge and keeps `gap` clear of the inks,
 * so it can't pass a gap narrower than twice that; the outside is what lies
 * within `gap` of the air, and the rest is the drawing. (A closing, with its
 * holes filled.) That also rounds off the hollows of the outline, a drip's
 * root or the corner under the melt, with a sliver of black beyond the
 * cream: a patch of the drawing with no ink on it that is open to the
 * outside and nowhere deeper than BLACK_FRINGE is one, and goes back to the
 * outside.
 */
function backing(inkMasks, gap) {
  // Room round the canvas for the air to pass, where the art touches its edge
  const pad = gap + BLACK_INSET + 2;
  const [w, h] = [width + 2 * pad, height + 2 * pad];
  const padded = (x, y) => (y + pad) * w + x + pad;
  const ink = new Uint8Array(w * h);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      if (inkMasks.some((mask) => mask[y * width + x] >= 128))
        ink[padded(x, y)] = 1;
  const fromInk = distanceSquared(ink, w, h);
  const air = new Uint8Array(w * h);
  flood(w, h, 0, (q) => fromInk[q] > gap * gap, air);
  const fromAir = distanceSquared(air, w, h);
  const outside = Uint8Array.from(fromAir, (d) => (d <= gap * gap ? 1 : 0));

  const fringe = (gap * (1 + BLACK_FRINGE)) ** 2;
  const seen = new Uint8Array(w * h);
  for (let p = 0; p < w * h; p++) {
    if (seen[p] || outside[p] || ink[p]) continue;
    // One patch of inkless drawing: whether it's open, and how deep it goes
    let open = false;
    const patch = flood(
      w,
      h,
      p,
      (q) => {
        if (outside[q]) open = true;
        return !outside[q] && !ink[q];
      },
      seen,
    );
    if (open && patch.every((q) => fromAir[q] <= fringe))
      for (const q of patch) outside[q] = 1;
  }

  const fromOutside = distanceSquared(outside, w, h);
  const mask = Buffer.alloc(pixels);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      if (fromOutside[padded(x, y)] > BLACK_INSET ** 2)
        mask[y * width + x] = 255;
  return mask;
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

const colours = {
  black: BLACK,
  ...Object.fromEntries(INKS.map((name) => [name, sampleInk(name)])),
};

/**
 * One SVG: the black behind the inks' masks and then each ink, a group
 * named after its layer, over the box around the art, through svgo (which
 * keeps the groups and their names).
 */
async function logo(inkMasks, gap) {
  const masks = [backing(inkMasks, gap), ...inkMasks];
  const [x, y, w, h] = artBox(masks);
  const layers = [];
  for (const [index, name] of LAYERS.entries()) {
    const d = await trace(masks[index]);
    if (d)
      layers.push(
        `<g id="${name}" fill="${colours[name]}"><path fill-rule="evenodd" d="${d}"/></g>`,
      );
  }
  const raw = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x * SCALE} ${y * SCALE} ${w * SCALE} ${h * SCALE}" width="${w}" height="${h}">${layers.join("")}</svg>`;
  return optimize(raw, {
    multipass: true,
    floatPrecision: 0,
    plugins: [
      {
        name: "preset-default",
        params: {
          overrides: {
            cleanupIds: false,
            collapseGroups: false,
            // Arcs fitted at whole units pull an edge up to 2px off its line
            convertPathData: { makeArcs: false },
          },
        },
      },
    ],
  }).data;
}

/** Writes a file and says how big it is. */
function write(file, contents) {
  writeFileSync(file, contents);
  console.log(`${file}: ${(statSync(file).size / 1024).toFixed(0)} KB`);
}

mkdirSync(outDir, { recursive: true });
const full = [silhouette, inkMask("mustard"), inkMask("red")];
const masters = {};
for (const [name, masks] of [
  ["gwenda-bottle", full],
  ["gwenda-bottle-record", await bottleAndRecord(full)],
]) {
  const svg = await logo(masks, BLACK_GAP[name]);
  masters[name] = svg;
  write(`${outDir}${name}.svg`, svg);
  write(`${outDir}${name}-1080-black.png`, await post(svg, BLACK));
  write(`${outDir}${name}-1080-transparent.png`, await post(svg, null));
}

// The website's and the emails' logo: the full master, on the original's canvas
const canvas = { width, height };
const logos = `${site}src/assets/images/logos/`;
write(`${logos}bottle.png`, await siteLogo(masters["gwenda-bottle"], canvas));
for (const w of HERO_LOGO_WIDTHS)
  write(
    `${logos}bottle-hero-${w}.webp`,
    await heroLogo(masters["gwenda-bottle"], canvas, w),
  );
write(
  `${site}public${EMAIL_LOGO_PATH}`,
  await emailLogo(masters["gwenda-bottle"], canvas),
);
console.log(LAYERS.map((name) => `${name} ${colours[name]}`).join(", "));
