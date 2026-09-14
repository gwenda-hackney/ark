import { describe, expect, it } from "vitest";
import {
  galleryContainerVars,
  galleryTileVars,
  getGalleryLayout,
  getGalleryTileSpan,
} from "./gallery-layout";

describe("getGalleryLayout", () => {
  it("positions four cocktails with named areas and varied tile spans", () => {
    const layout = getGalleryLayout(4);
    expect(layout.usesAreas).toBe(true);
    expect(layout.tileAreas).toEqual(["a", "b", "c", "d"]);
    expect(getGalleryTileSpan(layout, 0)).toEqual({ cols: 3, rows: 3 });
    expect(getGalleryTileSpan(layout, 1)).toEqual({ cols: 2, rows: 2 });
    expect(getGalleryTileSpan(layout, 2)).toEqual({ cols: 2, rows: 3 });
    expect(getGalleryTileSpan(layout, 3)).toEqual({ cols: 3, rows: 2 });
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
    expect(vars).toContain('grid-template-areas:"a a a b b"');
    expect(vars).toContain("--cols-d:5");
    expect(vars).not.toContain("--areas-d:");
  });
});
