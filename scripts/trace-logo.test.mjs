import { readFileSync, statSync } from "node:fs";
import sharp from "sharp";
import { describe, expect, it } from "vitest";

/**
 * The bottle logo's brand masters (#320), written by scripts/trace-logo.mjs:
 * light enough to hand around, and in the logo's own three inks only.
 */
const logos = new URL("../marketing/brand/logos/", import.meta.url);
const file = (name) => new URL(name, logos);

/** The logo's inks, sampled from bottle.png: cream, mustard, red. */
const INKS = ["#e6d9be", "#cd9f47", "#ba1b1f"];

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

it("leaves GWENDA off the bottle-and-record version", async () => {
  const [full, bottle] = await Promise.all(
    ["gwenda-bottle", "gwenda-bottle-record"].map((name) =>
      sharp(file(`${name}.svg`).pathname).metadata(),
    ),
  );
  expect(bottle.width).toBe(full.width);
  expect(bottle.height).toBeLessThan(full.height * 0.75);
});
