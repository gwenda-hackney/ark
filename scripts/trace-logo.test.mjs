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
 * The bottle logo's brand masters (#320), written by scripts/trace-logo.mjs:
 * light enough to hand around, in the logo's own inks only, and filled, so
 * they stand on any background.
 */
const masters = new URL("../marketing/brand/logos/", import.meta.url);
const file = (name) => new URL(name, masters);

/** The drawing's black (the site's ground), under the inks. */
const BLACK = "#0b0a08";
/** The logo's inks, sampled from the original: cream, mustard, red. */
const INKS = ["#e6d9be", "#cd9f47", "#ba1b1f"];
/** The layers, from the bottom up, as a design tool names them. */
const LAYERS = ["cream", "mustard", "red"];

/**
 * An SVG drawn at its own size on nothing: [r, g, b, alpha] at a point given
 * in the original's pixels (the SVG's units are a fraction of one).
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
    // The record between its grooves, the hole in its label, the skull's eye
    expect(at(70, 470)[3]).toBe(0);
    expect(at(360, 438)[3]).toBe(0);
    expect(at(765, 305)[3]).toBe(0);
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

describe("the bottle and record alone", () => {
  const svg = readFileSync(file("gwenda-bottle-record.svg"), "utf8");

  it("leaves GWENDA off", async () => {
    const [full, bottle] = await Promise.all(
      ["gwenda-bottle", "gwenda-bottle-record"].map((name) =>
        sharp(file(`${name}.svg`).pathname).metadata(),
      ),
    );
    expect(bottle.width).toBe(full.width);
    expect(bottle.height).toBeLessThan(full.height * 0.75);
  });

  it("ends the pour at the record: a whole front rim with drips over it, and clear air beyond", async () => {
    const at = await drawn(svg, file("gwenda-bottle-record.svg").pathname);
    const cream = [0xe6, 0xd9, 0xbe, 255];
    // The record's front rim: between two streams, under the pool, at its right
    for (const [x, y] of [
      [290, 565],
      [440, 566],
      [600, 528],
    ])
      expect(at(x, y), `rim at ${x},${y}`).toEqual(cream);
    // The drips: the pour's end, under two streams, and the melt on the left
    for (const [x, y] of [
      [648, 552],
      [521, 584],
      [345, 606],
      [83, 612],
    ])
      expect(at(x, y), `drip at ${x},${y}`).toEqual(cream);
    // Where the pour ran on under the bottle to the A, and where GWENDA stood
    for (const [x, y] of [
      [760, 490],
      [700, 520],
      [200, 600],
      [300, 600],
      [450, 600],
    ])
      expect(at(x, y)[3], `clear at ${x},${y}`).toBe(0);
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
