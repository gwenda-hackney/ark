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
 *   marketing/web/, from the full logo (scripts/lib/logo-renders.mjs)
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
 * The black is see-through, as in the original: the logo takes whatever it
 * sits on, so on a light page the linework (the record's grooves, the
 * skull's eyes, the scratches in the letters) shows that page. Put it on
 * black (the -1080-black posts) or a dark photo. Each master is three
 * stacked layers, a named group apiece for a design tool's layers:
 *
 *   1. cream: everything light, the whole drawing's silhouette. It is traced
 *      from the PNG's brightness, not from a colour pick, so its edges keep
 *      the PNG's anti-aliasing: the record's thinnest grooves stay grooves.
 *   2. mustard and 3. red, on top: the pixels whose hue is that ink's, inside
 *      the silhouette. Edge pixels darkening to black keep their hue but
 *      fall outside the silhouette, so they make no coloured specks.
 *
 * Each layer is drawn at 4x with a light blur before potrace, so the
 * drawing's frayed edges come through: the nicks into the cream, the slits
 * and pin-pricks in the letters (NICK, below). Specks of ink under SPECK_PX
 * are dropped. Each ink's colour is the median of its own clearly-inked
 * pixels in the PNG. svgo then shrinks the result.
 *
 * The bottle and record alone is the same tracing with the record's front
 * redrawn: where the pour ran down into GWENDA it ends at the record, in
 * marketing/brand/source/bottle-record-front.svg (drawn by hand; see
 * bottleAndRecord, below).
 */
import { createHash } from "node:crypto";
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

/**
 * Traced at this multiple of the PNG: fine enough that a nick one pixel wide
 * keeps its shape.
 */
const SCALE = 4;
/**
 * The blur at SCALE before tracing: just enough to take the PNG's pixel
 * steps off. More shuts the thinnest slits.
 */
const BLUR = 0.5;
/** An island of ink smaller than this, in PNG pixels, is a speck and goes. */
const SPECK_PX = 2;
/**
 * A hole in the ink is kept down to this, in PNG pixels: the pin-pricks in
 * the letters are that small.
 */
const PRICK_PX = 0.25;
/**
 * potrace's curve fitting: higher is fewer, looser curves, and thin slits
 * smoothed shut.
 */
const OPT_TOLERANCE = 0.2;
/**
 * Brightness (0–255) where the cream ends and the black begins: above the
 * middle, so the letters' thin scratches stay open.
 */
const SILHOUETTE = 150;
/**
 * The drawing is frayed: thin nicks into the cream from its edges, slits and
 * pin-pricks inside the letters, many too thin or too faint to fall under
 * SILHOUETTE (a scratch a pixel wide is only a shade darker than the cream).
 * A pixel at least NICK darker than the light within NICK_REACH px on every
 * side of it is part of such a mark, and the mark's edge is then half way
 * between that light and the mark's own darkest, however faint it is.
 */
const NICK = 26;
const NICK_REACH = 2;
/**
 * The mustard and the red are cut out pixel by pixel, so their edges are
 * steps: they take this much blur, in PNG pixels, before tracing.
 */
const STEP_BLUR = 0.7;
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

/** Our black, the site's ground (--ch-bg): what the black posts stand on. */
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
/**
 * The SVG's layers, from the bottom up: the inks. There is no black one: the
 * original's black is see-through, so the logo takes whatever it sits on
 * (the leather, an email's board, a photo).
 */
const LAYERS = INKS;

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

/** A colour's brightness, 0–255, from its hex. */
function lightnessOf(hex) {
  const [r, g, b] = [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16));
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/** Layers already traced, by their mask: the two logos share most of theirs. */
const traced = new Map();

/**
 * A layer's path data: potrace of a 0–255 mask (255 is ink), drawn at SCALE
 * and blurred by `blur` px of that. Islands of ink under SPECK_PX are dropped
 * here, so that potrace's own speck size, which takes holes and islands
 * alike, can be the far smaller PRICK_PX and keep the pin-pricks.
 */
async function trace(mask, blur = BLUR) {
  const key = createHash("sha1").update(mask).digest("hex");
  if (traced.has(key)) return traced.get(key);
  const [w, h] = [width * SCALE, height * SCALE];
  const drawn = await sharp(mask, { raw: { width, height, channels: 1 } })
    .resize(w, h, { kernel: "lanczos3" })
    .blur(blur)
    .extractChannel(0)
    .raw()
    .toBuffer();
  const ink = Uint8Array.from(drawn, (v) => (v >= 128 ? 1 : 0));
  const seen = new Uint8Array(w * h);
  for (let p = 0; p < w * h; p++) {
    if (!ink[p] || seen[p]) continue;
    const island = flood(w, h, p, (q) => ink[q] === 1, seen);
    if (island.length < SPECK_PX * SCALE * SCALE)
      for (const q of island) ink[q] = 0;
  }
  const png = await sharp(Buffer.from(ink.map((v) => (v ? 0 : 255))), {
    raw: { width: w, height: h, channels: 1 },
  })
    .png()
    .toBuffer();
  const svg = await new Promise((resolve, reject) =>
    potrace.trace(
      png,
      {
        threshold: 128,
        turdSize: PRICK_PX * SCALE * SCALE,
        optTolerance: OPT_TOLERANCE,
      },
      (error, result) => (error ? reject(error) : resolve(result)),
    ),
  );
  const d = svg.match(/ d="([^"]*)"/)?.[1] ?? "";
  traced.set(key, d);
  return d;
}

/**
 * A grey picture with every pixel replaced by the lightest (Math.max) or the
 * darkest (Math.min) within `reach` px of it.
 */
function spread(grey, reach, pick) {
  const near = [];
  for (let dy = -reach; dy <= reach; dy++)
    for (let dx = -reach; dx <= reach; dx++)
      if (dx * dx + dy * dy <= reach * reach + 0.5) near.push([dx, dy]);
  const out = new Uint8Array(pixels);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      let v = grey[y * width + x];
      for (const [dx, dy] of near) {
        const [nx, ny] = [x + dx, y + dy];
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        v = pick(v, grey[ny * width + nx]);
      }
      out[y * width + x] = v;
    }
  return out;
}

/**
 * The mustard is cut out by hue, and a pixel where the red fades into the
 * cream has the mustard's hue too: a line of mustard one pixel wide is that,
 * not ink, and goes (a pixel stays with four of the nine round it).
 */
{
  const mustard = Uint8Array.from(inkOf, (ink) => (ink === "mustard" ? 1 : 0));
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const p = y * width + x;
      if (!mustard[p]) continue;
      let near = 0;
      for (let ny = y - 1; ny <= y + 1; ny++)
        for (let nx = x - 1; nx <= x + 1; nx++)
          if (nx >= 0 && ny >= 0 && nx < width && ny < height)
            near += mustard[ny * width + nx];
      if (near < 4) inkOf[p] = lightness[p] >= INK_MIN ? "cream" : null;
    }
}

/**
 * The frayed marks (NICK), as a mask value per pixel: under 128 inside a
 * mark, 255 where there is none. A mark is thin and dark in the light, so
 * the light across it is what is left once the lightest nearby is spread in
 * and back out again (a closing), and no lighter than the cream itself (the
 * PNG's edges have a bright rim, which would make a mark of the plain cream
 * beside it). Beside the mustard or the red, the dark is that ink, not a
 * mark.
 */
const creamLight = lightnessOf(sampleInk("cream"));
const light = spread(
  spread(lightness, NICK_REACH, Math.max),
  NICK_REACH,
  Math.min,
);
const darkest = spread(lightness, 1, Math.min);
const otherInk = spread(
  Uint8Array.from(inkOf, (ink) => (ink === "mustard" || ink === "red" ? 1 : 0)),
  NICK_REACH + 1,
  Math.max,
);
const nicks = new Uint8Array(pixels).fill(255);
for (let p = 0; p < pixels; p++) {
  if (otherInk[p]) continue;
  const [v, hi, lo] = [
    lightness[p],
    Math.min(light[p], creamLight),
    darkest[p],
  ];
  if (hi - v < NICK) continue;
  const value = 128 + ((v - (hi + lo) / 2) * 255) / (hi - lo);
  nicks[p] = Math.max(0, Math.min(255, Math.round(value)));
}

const inkMask = (name) => {
  const mask = Buffer.alloc(pixels);
  for (let p = 0; p < pixels; p++) mask[p] = inkOf[p] === name ? 255 : 0;
  return mask;
};

/**
 * The silhouette, with SILHOUETTE moved to the middle of the range so that
 * the trace's threshold falls on it and the blur stays proportional, and
 * the frayed marks cut into it.
 */
const silhouette = Buffer.alloc(pixels);
for (let p = 0; p < pixels; p++) {
  const v = lightness[p];
  const lit =
    v < SILHOUETTE
      ? Math.round((v / SILHOUETTE) * 128)
      : Math.round(128 + ((v - SILHOUETTE) / (255 - SILHOUETTE)) * 127);
  silhouette[p] = Math.min(lit, nicks[p]);
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

const colours = Object.fromEntries(INKS.map((name) => [name, sampleInk(name)]));

/**
 * One SVG: each ink's mask as a group named after its layer, over the box
 * around the art, through svgo (which keeps the groups and their names).
 */
async function logo(masks) {
  const [x, y, w, h] = artBox(masks);
  const layers = [];
  for (const [index, name] of LAYERS.entries()) {
    // The cream keeps the PNG's own soft edges; the rest are cut in steps
    const d = await trace(
      masks[index],
      name === "cream" ? BLUR : STEP_BLUR * SCALE,
    );
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
  const svg = await logo(masks);
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
