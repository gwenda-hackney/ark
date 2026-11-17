import { readFileSync, statSync } from "node:fs";
import sharp from "sharp";
import { describe, expect, it } from "vitest";

/**
 * The bottle logo's brand masters (#320), written by scripts/trace-logo.mjs:
 * light enough to hand around, in the logo's own inks only, and filled, so
 * they stand on any background.
 */
const logos = new URL("../marketing/brand/logos/", import.meta.url);
const file = (name) => new URL(name, logos);

/** The drawing's black (the site's ground), under the inks. */
const BLACK = "#0b0a08";
/** The logo's inks, sampled from the original: cream, mustard, red. */
const INKS = ["#e6d9be", "#cd9f47", "#ba1b1f"];
/** The layers, from the bottom up, as a design tool names them. */
const LAYERS = ["black", "cream", "mustard", "red"];

/**
 * An SVG drawn at its own size on nothing: [r, g, b, alpha] at a point given
 * in the original's pixels (the SVG's units are half of one).
 */
async function drawn(svg, path) {
  const [x0, y0] = svg
    .match(/viewBox="([^"]*)"/)[1]
    .split(" ")
    .map((n) => Number(n) / 2);
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
    for (const colour of colours) expect([BLACK, ...INKS]).toContain(colour);
  });

  it("has a named layer for the black and for each ink, black at the bottom", () => {
    const ids = [...svg.matchAll(/<g[^>]* id="([^"]+)"/g)].map(([, id]) => id);
    expect(ids).toEqual(LAYERS);
    expect(svg).toMatch(
      new RegExp(
        `<g[^>]* id="black"[^>]* fill="${BLACK}"|<g[^>]* fill="${BLACK}"[^>]* id="black"`,
      ),
    );
  });

  it("stands on any background: black inside the drawing, nothing outside it", async () => {
    const at = await drawn(svg, file(`${name}.svg`).pathname);
    const black = [0x0b, 0x0a, 0x08, 255];
    // The record between its grooves, the hole in its label, the skull's eye
    expect(at(70, 470)).toEqual(black);
    expect(at(360, 438)).toEqual(black);
    expect(at(765, 305)).toEqual(black);
    // A corner, and the open air between the record and the bottle's mouth
    expect(at(5, 5)[3]).toBe(0);
    expect(at(150, 150)[3]).toBe(0);
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
