import { describe, expect, it } from "vitest";
import {
  objectPositionFromHotspot,
  sanityCroppedUrl,
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
