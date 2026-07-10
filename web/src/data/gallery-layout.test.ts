import { describe, expect, it } from "vitest";
import {
  galleryContainerVars,
  galleryTileVars,
  getGalleryLayout,
} from "./gallery-layout";

describe("getGalleryLayout", () => {
  it("positions four cocktails with named areas and a tall feature tile", () => {
    const layout = getGalleryLayout(4);
    expect(layout.usesAreas).toBe(true);
    expect(layout.tileAreas).toEqual(["a", "b", "c", "d"]);
    // Feature tile "a" spans three of five rows on desktop → varied heights.
    const aRows = layout.areasDesktop.match(/a/g)?.length;
    expect(aRows).toBeGreaterThan(layout.areasDesktop.match(/d/g)?.length ?? 0);
  });

  it("falls back to span rhythm for large galleries", () => {
    const layout = getGalleryLayout(9);
    expect(layout.usesAreas).toBe(false);
    expect(layout.tileAreas).toHaveLength(0);
  });
});

describe("galleryTileVars", () => {
  it("emits a grid-area for mapped layouts", () => {
    const layout = getGalleryLayout(4);
    expect(galleryTileVars(layout, 0)).toBe("grid-area: a");
  });

  it("emits span custom properties for the fallback", () => {
    const layout = getGalleryLayout(9);
    expect(galleryTileVars(layout, 0)).toContain("--tile-col");
  });
});

describe("galleryContainerVars", () => {
  it("includes desktop area templates for mapped layouts", () => {
    const vars = galleryContainerVars(getGalleryLayout(4));
    expect(vars).toContain("--areas-d:");
    expect(vars).toContain("--cols-d:5");
    expect(vars).not.toContain("--areas-m:");
  });
});
