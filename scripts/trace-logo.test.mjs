import { readFileSync, statSync } from "node:fs";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { EMAIL_LOGO_PATH } from "../shared/email/shell.js";
import {
  HERO_LOGO_WIDTHS,
  emailLogo,
  heroLogo,
  siteLogo,
} from "./lib/logo-renders.mjs";

/**
 * The bottle logo's brand masters (#320), written by scripts/trace-logo.mjs,
 * each traced from a drawing of its own: light enough to hand around, in the
 * logo's own inks only, with the black see-through.
 */
const masters = new URL("../marketing/brand/logos/", import.meta.url);
const file = (name) => new URL(name, masters);

/** The logo's inks, sampled from the original: cream, mustard, red. */
const INKS = ["#e6d9be", "#cd9f47", "#ba1b1f"];
/** The layers, from the bottom up, as a design tool names them. */
const LAYERS = ["cream", "mustard", "red"];

/**
 * Where each master is see-through, in its own pixels: the record between
 * two grooves, the hole in its label, the skull's eye.
 */
const BLACK = {
  "gwenda-bottle": [
    [70, 470],
    [360, 438],
    [765, 305],
  ],
  "gwenda-bottle-record": [
    [225, 491],
    [407, 496],
    [858, 348],
  ],
};

/**
 * An SVG drawn at its own size on nothing: [r, g, b, alpha] at a point given
 * in its drawing's pixels (the SVG's units are a fraction of one).
 */
async function drawn(svg, path) {
  const box = svg
    .match(/viewBox="([^"]*)"/)[1]
    .split(" ")
    .map(Number);
  const unit = box[2] / Number(svg.match(/<svg[^>]* width="(\d+)"/)[1]);
  const [x0, y0] = [box[0] / unit, box[1] / unit];
  const { data, info } = await sharp(path)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return (x, y) => {
    const at = (Math.round(y - y0) * info.width + Math.round(x - x0)) * 4;
    return [...data.subarray(at, at + 4)];
  };
}

describe.each(["gwenda-bottle", "gwenda-bottle-record"])("%s", (name) => {
  const svg = readFileSync(file(`${name}.svg`), "utf8");

  it("is an SVG under 150 KB", () => {
    expect(svg).toMatch(/^<svg[^>]*viewBox=/);
    expect(statSync(file(`${name}.svg`)).size / 1024).toBeLessThan(150);
  });

  it("uses only the logo's inks", () => {
    const colours = new Set(
      [...svg.matchAll(/#[0-9a-f]{3,6}\b/gi)].map(([c]) => c.toLowerCase()),
    );
    expect(colours.size).toBeGreaterThan(0);
    for (const colour of colours) expect(INKS).toContain(colour);
  });

  it("has a named layer for each ink, and no black: the black is see-through", async () => {
    const ids = [...svg.matchAll(/<g[^>]* id="([^"]+)"/g)].map(([, id]) => id);
    expect(ids).toEqual(LAYERS);
    const at = await drawn(svg, file(`${name}.svg`).pathname);
    for (const [x, y] of BLACK[name])
      expect(at(x, y)[3], `see-through at ${x},${y}`).toBe(0);
  });

  it.each(["black", "transparent"])(
    "has a 1080x1080 post on %s",
    async (bg) => {
      const meta = await sharp(
        file(`${name}-1080-${bg}.png`).pathname,
      ).metadata();
      expect([meta.width, meta.height]).toEqual([1080, 1080]);
      expect(meta.hasAlpha).toBe(true);
    },
  );
});

describe("the drawing's frayed edges", () => {
  it("keeps the pin-pricks in the letters, too small and faint for a plain threshold", async () => {
    const svg = readFileSync(file("gwenda-bottle.svg"), "utf8");
    const at = await drawn(svg, file("gwenda-bottle.svg").pathname);
    // In the E, the A, the E's foot and the D's: a pixel or two across, grey
    for (const [x, y] of [
      [673, 605],
      [833, 633],
      [452, 794],
      [692, 826],
    ]) {
      // A hole in the cream (the black is see-through), give or take the
      // soft edge of so small a mark
      expect(at(x, y)[3], `pin-prick at ${x},${y}`).toBeLessThan(128);
    }
  });

  it("is still light enough to hand around", () => {
    expect(statSync(file("gwenda-bottle.svg")).size / 1024).toBeLessThan(120);
  });
});

/**
 * The bottle and record alone is a drawing of its own
 * (marketing/brand/source/bottle-record-redraw.png), not the full logo with
 * GWENDA taken off. Points are in the master's own pixels.
 */
describe("the bottle and record alone", () => {
  const path = file("gwenda-bottle-record.svg").pathname;
  const svg = readFileSync(path, "utf8");
  const [cream, mustard, red] = [
    [0xe6, 0xd9, 0xbe, 255],
    [0xcd, 0x9f, 0x47, 255],
    [0xba, 0x1b, 0x1f, 255],
  ];

  it("is cut to its art, with a small margin round it", async () => {
    const { data, info } = await sharp(path)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    let [left, top, right, bottom] = [info.width, info.height, 0, 0];
    for (let p = 0; p < info.width * info.height; p++) {
      if (data[p * 4 + 3] < 128) continue;
      const [x, y] = [p % info.width, Math.floor(p / info.width)];
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x + 1);
      bottom = Math.max(bottom, y + 1);
    }
    // The drawing's canvas is 1254 square: the master is its art and 8px
    expect(info.width).toBeLessThan(1150);
    expect(info.height).toBeLessThan(900);
    for (const room of [left, top, info.width - right, info.height - bottom]) {
      expect(room).toBeGreaterThanOrEqual(6);
      expect(room).toBeLessThanOrEqual(10);
    }
  });

  it("is see-through where the drawing is black", async () => {
    const at = await drawn(svg, path);
    // A corner, the air over the record, under the drips; the bottle's label
    // panel, a second gap between grooves
    for (const [x, y] of [
      [5, 11],
      [215, 151],
      [615, 841],
      [815, 411],
      [225, 491],
    ])
      expect(at(x, y)[3], `see-through at ${x},${y}`).toBe(0);
  });

  it("has the record's rim, a groove, the skull and the three drips in cream", async () => {
    const at = await drawn(svg, path);
    // The rim on the left and at the front; a groove; the skull's forehead
    for (const [x, y] of [
      [40, 541],
      [215, 696],
      [177, 491],
      [880, 291],
    ])
      expect(at(x, y), `cream at ${x},${y}`).toEqual(cream);
    // The drips, left to right: the long one, the short one, the last
    for (const [x, y] of [
      [563, 811],
      [660, 756],
      [770, 776],
    ])
      expect(at(x, y), `drip at ${x},${y}`).toEqual(cream);
  });

  it("has the label in mustard and the streak in the pour in red", async () => {
    const at = await drawn(svg, path);
    expect(at(335, 501)).toEqual(mustard);
    expect(at(505, 501)).toEqual(mustard);
    expect(at(450, 291)).toEqual(red);
  });
});

/**
 * The logo's other files are drawn from the full master by the same script
 * and committed: each must still be its master's drawing, so a master that
 * changes without them (or the other way round) fails here.
 */
describe("the website's and the emails' logo", () => {
  const master = readFileSync(file("gwenda-bottle.svg"), "utf8");
  const web = new URL("../marketing/web/", import.meta.url);
  const logos = new URL("src/assets/images/logos/", web);
  const original = new URL("../source/bottle-original.png", masters);

  /** The original's canvas, which the website's files keep. */
  const canvas = async () => {
    const { width, height } = await sharp(original.pathname).metadata();
    return { width, height };
  };

  /** The share of a picture's pixels that are not a fresh drawing's. */
  async function stale(committed, fresh) {
    const [a, b] = await Promise.all(
      [committed.pathname, fresh].map((input) =>
        sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
      ),
    );
    expect([a.info.width, a.info.height]).toEqual([
      b.info.width,
      b.info.height,
    ]);
    let off = 0;
    for (let at = 0; at < a.data.length; at += 4)
      for (let k = 0; k < 4; k++)
        if (Math.abs(a.data[at + k] - b.data[at + k]) > 24) {
          off += 1;
          break;
        }
    return off / (a.data.length / 4);
  }

  it("is the master at the original's size, for the menu and the bar", async () => {
    const committed = new URL("bottle.png", logos);
    const meta = await sharp(committed.pathname).metadata();
    expect([meta.width, meta.height, meta.hasAlpha]).toEqual([956, 844, true]);
    expect(
      await stale(committed, await siteLogo(master, await canvas())),
    ).toBeLessThan(0.005);
  });

  it.each(HERO_LOGO_WIDTHS)(
    "is the master on home's hero, %ipx wide",
    async (width) => {
      const committed = new URL(`bottle-hero-${width}.webp`, logos);
      expect((await sharp(committed.pathname).metadata()).width).toBe(width);
      expect(
        await stale(committed, await heroLogo(master, await canvas(), width)),
      ).toBeLessThan(0.005);
    },
  );

  it("is the master with SOCIAL under it, at the top of an email", async () => {
    const committed = new URL(`public${EMAIL_LOGO_PATH}`, web);
    const meta = await sharp(committed.pathname).metadata();
    expect([meta.width, meta.channels]).toEqual([400, 3]);
    expect(
      await stale(committed, await emailLogo(master, await canvas())),
    ).toBeLessThan(0.005);
  });

  it("is see-through where the drawing is black, as the masters are", async () => {
    const { data, info } = await sharp(new URL("bottle.png", logos).pathname)
      .raw()
      .toBuffer({ resolveWithObject: true });
    const at = (x, y) => [
      ...data.subarray((y * info.width + x) * 4, (y * info.width + x) * 4 + 4),
    ];
    // The hole in the record's label; a corner of the canvas
    expect(at(360, 438)[3]).toBe(0);
    expect(at(5, 5)[3]).toBe(0);
  });
});
