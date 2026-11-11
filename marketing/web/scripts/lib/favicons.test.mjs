import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { siteConfig } from "../../src/config/site.ts";
import { RECORD_DRAWINGS } from "../../src/lib/chart-record-drawings.js";
import {
  ICON_SOURCES,
  packIco,
  readIco,
  recordDrawing,
  svgToPng,
} from "./favicons.mjs";

const web = resolve(import.meta.dirname, "../..");
const publicFile = (name) => readFileSync(resolve(web, "public", name));
const sourceFile = (name) =>
  readFileSync(resolve(web, "src/assets/images/logos/icon", name));
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

describe("packIco", () => {
  it("packs PNGs that read back at their sizes", async () => {
    const svg = sourceFile(ICON_SOURCES.tab);
    const ico = packIco([
      { size: 16, png: await svgToPng(svg, 16) },
      { size: 32, png: await svgToPng(svg, 32) },
    ]);
    const entries = readIco(ico);
    expect(entries.map((entry) => entry.size)).toEqual([16, 32]);
    for (const { size, png } of entries) {
      expect(png.subarray(0, 4)).toEqual(PNG_SIGNATURE);
      const { width, height } = await sharp(png).metadata();
      expect([width, height]).toEqual([size, size]);
    }
  });

  it("refuses a size an .ico cannot hold", () => {
    expect(() => packIco([{ size: 300, png: Buffer.alloc(0) }])).toThrow();
  });
});

describe("the site's icons in public/ (npm run generate:favicons)", () => {
  it("are drawn as vectors, with no picture pasted in", () => {
    for (const name of Object.values(ICON_SOURCES)) {
      const svg = sourceFile(name).toString();
      expect(svg).toMatch(/<svg\b/);
      expect(svg).not.toMatch(/<image\b/);
    }
  });

  it("serve the tab's SVG as drawn", () => {
    expect(publicFile("favicon.svg")).toEqual(sourceFile(ICON_SOURCES.tab));
  });

  it("have a 16 and a 32 in favicon.ico", async () => {
    const entries = readIco(publicFile("favicon.ico"));
    expect(entries.map((entry) => entry.size)).toEqual([16, 32]);
    for (const { size, png } of entries) {
      const { width } = await sharp(png).metadata();
      expect(width).toBe(size);
    }
  });

  it("have favicon.png at the size the head links it at", async () => {
    const { width, height } = await sharp(publicFile("favicon.png")).metadata();
    expect([width, height]).toEqual([
      siteConfig.brand.faviconSize,
      siteConfig.brand.faviconSize,
    ]);
  });

  it("have a 180 home-screen icon with no transparency", async () => {
    const meta = await sharp(publicFile("apple-touch-icon.png")).metadata();
    expect([meta.width, meta.height]).toEqual([180, 180]);
    expect(meta.hasAlpha).toBe(false);
  });
});

describe("recordDrawing", () => {
  it("takes the home-screen icon's board away and crops to the record's rim", () => {
    const { viewBox, body } = recordDrawing(
      sourceFile(ICON_SOURCES.app).toString(),
    );
    expect(viewBox).toBe("3 3 174 174");
    expect(body).not.toMatch(/<rect\b/);
    expect(body).toMatch(/^<circle cx="90" cy="90" r="87" fill="#f2e8d2"\/>/);
    // The three grooves and the skull stay
    expect(body.match(/<circle r=/g)).toHaveLength(3);
    expect(body).toMatch(/<path fill="#0b0a08" fill-rule="evenodd"/);
  });

  it("keeps the tab's drawing on its own pixel grid, comments and all whitespace out", () => {
    const { viewBox, body } = recordDrawing(
      sourceFile(ICON_SOURCES.tab).toString(),
    );
    expect(viewBox).toBe("0 0 32 32");
    expect(body).not.toMatch(/<!--|\n|>\s+</);
  });
});

describe("the record on the site's pages (npm run generate:favicons)", () => {
  it("is the icons' own drawing, without the board", () => {
    expect(RECORD_DRAWINGS).toEqual({
      small: recordDrawing(sourceFile(ICON_SOURCES.tab).toString()),
      large: recordDrawing(sourceFile(ICON_SOURCES.app).toString()),
    });
  });
});
