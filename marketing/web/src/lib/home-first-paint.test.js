import { readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { siteConfig } from "../config/site";

/**
 * Home's logo is the first thing a visitor sees and the page's largest paint:
 * it must arrive first, and nothing on the way in may hold it up (measured on
 * a slow phone connection, #240 launch). These keep the choices that made it
 * so; e2e/home-logo-first.spec.js checks the page itself.
 */
const src = (path) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const kb = (path) =>
  statSync(new URL(`../${path}`, import.meta.url)).size / 1024;

describe("home's logo comes first", () => {
  it("has no font preloaded on every page", () => {
    // A preloaded font is fetched ahead of the logo: three for the hero cost
    // it half a second; the old look's four were never used on home at all.
    for (const file of ["components/Fonts.astro", "layouts/BaseLayout.astro"]) {
      const code = src(file);
      expect(code, file).not.toMatch(/rel=["']preload["']/);
      expect(code, file).not.toMatch(/cormorant|lora/i);
    }
  });

  it("asks for the logo at high priority, never lazily", () => {
    const img = src("components/chart/ChartHome.astro").match(
      /<img\b[^>]*\{\.\.\.chartHeroLogo\}[^>]*>/,
    )?.[0];
    expect(img).toBeDefined();
    expect(img).toMatch(/fetchpriority="high"/);
    expect(img).toMatch(/loading="eager"/);
    expect(img).not.toMatch(/loading="lazy"/);
  });

  it("offers a phone a phone-sized logo", () => {
    const assets = src("lib/chart-assets.ts");
    for (const width of [320, 432, 640, 864]) {
      expect(assets).toContain(`bottle-hero-${width}.webp`);
    }
    expect(assets).toMatch(/sizes: "\(min-width: 33rem\) 27rem, 82vw"/);
  });

  it("keeps the logo files light", () => {
    // 16-colour lossless (scripts/write-hero-logo.mjs): 64 KB at 864px,
    // where astro:assets' lossy WebP was 190 KB
    expect(kb("assets/images/logos/bottle-hero-864.webp")).toBeLessThan(80);
    expect(kb("assets/images/logos/bottle-hero-640.webp")).toBeLessThan(45);
  });

  it("keeps the leather light", () => {
    // It loads beside the logo on every Chart page: 135 KB at quality 90
    expect(kb("assets/images/texture/leather.webp")).toBeLessThan(80);
  });
});

describe("SOCIAL's own cut of Rubik Distressed", () => {
  const css = src("styles/chart-sign-font.css").replace(
    /\/\*[\s\S]*?\*\//g,
    "",
  );
  const faces = [...css.matchAll(/@font-face\s*\{([^}]*)\}/g)].map(
    ([, body]) => ({
      src: body.match(/src:\s*url\("([^"]+)"\)/)?.[1] ?? "",
      range: body.match(/unicode-range:([^;]+);/)?.[1] ?? "",
    }),
  );
  /** Whether a unicode-range takes in a code point. */
  const covers = (range, code) =>
    range.split(",").some((part) => {
      const [from, to = from] = part.trim().replace(/^U\+/i, "").split("-");
      return code >= parseInt(from, 16) && code <= parseInt(to, 16);
    });
  const small = faces.find((face) => face.src.includes("social"));
  const full = faces.find((face) => face.src.includes("@fontsource"));

  it("is what chart.css loads, not the full file", () => {
    const chart = src("styles/chart.css");
    expect(chart).toContain('@import "./chart-sign-font.css";');
    expect(chart).not.toContain("@fontsource/rubik-distressed");
  });

  it("covers every letter of SOCIAL, and the full file none of them", () => {
    const letters = [...siteConfig.copy.social.toUpperCase()];
    for (const letter of letters) {
      const code = letter.codePointAt(0);
      expect(covers(small.range, code), letter).toBe(true);
      expect(covers(full.range, code), letter).toBe(false);
    }
  });

  it("stays small", () => {
    expect(kb("assets/fonts/rubik-distressed-social.woff2")).toBeLessThan(16);
  });
});
