import { existsSync } from "node:fs";
import { resolve } from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { siteConfig } from "../config/site";
import { webManifest } from "./web-manifest";

const publicDir = resolve(import.meta.dirname, "../../public");

describe("webManifest", () => {
  it("names the site and lists the Android icons, the largest also maskable", () => {
    const manifest = webManifest();
    expect(manifest.short_name).toBe(siteConfig.name);
    expect(manifest.start_url).toBe("/");
    expect(manifest.icons).toEqual([
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ]);
  });

  it("lists only icons that are in public/, at the size it says", async () => {
    for (const { src, sizes } of webManifest().icons) {
      const file = resolve(publicDir, src.slice(1));
      expect(existsSync(file), src).toBe(true);
      const { width, height, hasAlpha } = await sharp(file).metadata();
      expect(`${width}x${height}`).toBe(sizes);
      // A home-screen icon with transparency shows black or white behind it
      expect(hasAlpha).toBe(false);
    }
  });
});
