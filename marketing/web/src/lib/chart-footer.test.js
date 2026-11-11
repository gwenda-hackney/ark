import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CHART_SECTIONS } from "./chart-nav.js";
import {
  BACK_TO_TOP,
  FOOT_LINKS,
  mapsSearchUrl,
  phoneHref,
  phoneText,
} from "./chart-footer.js";

const src = new URL("..", import.meta.url).pathname;

/** Every .astro file under src/, with its source. */
function astroFiles(dir = src) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return astroFiles(path);
    if (!entry.name.endsWith(".astro")) return [];
    return [
      { file: path.slice(src.length), source: readFileSync(path, "utf8") },
    ];
  });
}

describe("BACK_TO_TOP, the record on the foot's trail (#240)", () => {
  it("goes back up to the page's main, called Back to top", () => {
    expect(BACK_TO_TOP).toEqual({ href: "#main", label: "Back to top" });
  });

  it("is on the foot", () => {
    const foot = readFileSync(
      join(src, "components/chart/ChartFooter.astro"),
      "utf8",
    );
    expect(foot).toMatch(/<a\b[^>]*\shref=\{BACK_TO_TOP\.href\}/);
    expect(foot).toMatch(/<ChartRecord\b[^>]*\slabel=\{BACK_TO_TOP\.label\}/);
  });

  it("lands on every page with the foot", () => {
    const id = BACK_TO_TOP.href.slice(1);
    const withFoot = astroFiles().filter(
      ({ file, source }) =>
        !file.endsWith("ChartFooter.astro") && /<ChartFooter\b/.test(source),
    );
    expect(withFoot.length).toBeGreaterThan(2);
    for (const { file, source } of withFoot)
      expect({ file, lands: source.includes(`id="${id}"`) }).toEqual({
        file,
        lands: true,
      });
  });
});

describe("FOOT_LINKS", () => {
  it("is Photos, Play here and About", () => {
    expect(FOOT_LINKS).toEqual([
      { label: "Photos", href: "/photos" },
      { label: "Play here", href: "/contact/play" },
      { label: "About", href: "/about" },
    ]);
  });

  it("never repeats a place the navigation carries", () => {
    const nav = new Set(CHART_SECTIONS.map((section) => section.href));
    for (const link of FOOT_LINKS) expect(nav.has(link.href)).toBe(false);
  });
});

describe("mapsSearchUrl", () => {
  it("searches Google Maps for the place by name and address", () => {
    const url = new URL(
      mapsSearchUrl({
        name: "Gwenda",
        address: "Unit 4003, 4 Schwartz Wharf, London, E9 5AA",
      }),
    );
    expect(url.origin + url.pathname).toBe(
      "https://www.google.com/maps/search/",
    );
    expect(url.searchParams.get("api")).toBe("1");
    expect(url.searchParams.get("query")).toBe(
      "Gwenda, Unit 4003, 4 Schwartz Wharf, London, E9 5AA",
    );
  });
});

describe("phone", () => {
  it("dials the number from anywhere", () => {
    expect(phoneHref("+44 20 4637 4754")).toBe("tel:+442046374754");
  });

  it("writes it as people in London read it", () => {
    expect(phoneText("+44 20 4637 4754")).toBe("020 4637 4754");
  });
});
