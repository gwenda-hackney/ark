import { describe, expect, it } from "vitest";
import {
  isWholeFit,
  markWholeFit,
  objectPositionFromHotspot,
  resolveHeroUrl,
  sanityCroppedUrl,
  withImageParams,
} from "./sanity-image-url.js";

describe("sanityCroppedUrl", () => {
  it("delivers the 16×10 card inside the crop, without cropping it again", () => {
    const url = sanityCroppedUrl(
      "https://cdn.sanity.io/images/demo/production/hero.jpg",
      { left: 0, top: 0.2, right: 0, bottom: 0.1 },
      { width: 1000, height: 1000 },
      { width: 800, height: 500, quality: 80 },
    );
    // Stored window is 1000×700. The card inside it is 1000×625.
    expect(url).toContain("rect=0%2C238%2C1000%2C625");
    expect(url).toContain("w=800");
    expect(url).toContain("h=500");
    expect(url).toContain("fit=max");
    expect(url).not.toContain("fit=crop");
    expect(url).toContain("auto=format");
  });

  it("still requests a 16×10 crop when there is no edge crop", () => {
    const url = sanityCroppedUrl(
      "https://cdn.sanity.io/images/demo/production/hero.jpg",
      { left: 0, top: 0, right: 0, bottom: 0 },
      { width: 1000, height: 1000 },
    );
    expect(url).not.toContain("rect=");
    expect(url).not.toContain("fit=crop");
    expect(url).toContain("w=1600");
  });
});

describe("objectPositionFromHotspot", () => {
  it("maps hotspot fractions to CSS object-position", () => {
    expect(
      objectPositionFromHotspot({ x: 0.5, y: 0.8, width: 0.2, height: 0.2 }),
    ).toBe("50.0% 80.0%");
  });
});

describe("whole image heroes (#27)", () => {
  it("marks the URL only for fit: whole, once", () => {
    const url = "https://cdn.sanity.io/images/p/d/a.jpg";
    expect(markWholeFit(url, "whole")).toBe(`${url}#whole`);
    expect(markWholeFit(`${url}#whole`, "whole")).toBe(`${url}#whole`);
    expect(markWholeFit(url, "fill")).toBe(url);
    expect(isWholeFit(`${url}#whole`)).toBe(true);
    expect(isWholeFit(url)).toBe(false);
  });

  it("adds query parameters before the fragment", () => {
    expect(withImageParams("https://x.co/a.jpg#whole", "w=960")).toBe(
      "https://x.co/a.jpg?w=960#whole",
    );
    expect(withImageParams("https://x.co/a.jpg?q=1", "w=960")).toBe(
      "https://x.co/a.jpg?q=1&w=960",
    );
  });

  it("resolves an uncropped, marked hero from a list row", () => {
    const url = resolveHeroUrl({
      heroAssetUrl: "https://cdn.sanity.io/images/p/d/a.jpg",
      heroFit: "whole",
      heroCrop: null,
      heroHotspot: null,
    });
    expect(url).not.toMatch(/rect=/);
    expect(isWholeFit(url)).toBe(true);
  });
});
