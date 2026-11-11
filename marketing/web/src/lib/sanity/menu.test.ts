import { describe, expect, it } from "vitest";
import {
  mapFlatSection,
  mapMenuPrices,
  nestMenuSections,
  popupSeriesSlug,
} from "./menu";

describe("mapMenuPrices", () => {
  it("keeps rows with a name and a price, trimmed", () => {
    expect(
      mapMenuPrices([
        { name: " 125 ml ", size: "125 ml", price: "7" },
        { name: "Bottle", size: null, price: "34" },
        { name: "", price: "9" },
        { name: "Large", price: null },
      ]),
    ).toEqual([
      { name: "125 ml", size: "125 ml", price: "7" },
      { name: "Bottle", price: "34" },
    ]);
  });

  it("is empty for a drink published before the list", () => {
    expect(mapMenuPrices(null)).toBeUndefined();
    expect(mapMenuPrices([])).toBeUndefined();
  });
});

describe("nestMenuSections", () => {
  it("nests subsections under chapters", () => {
    const nested = nestMenuSections([
      { id: "by-the-book", title: "By the Book", items: [] },
      { id: "spritz", title: "Spritz", items: [], parentId: "by-the-book" },
    ]);
    expect(nested).toHaveLength(1);
    expect(nested[0].subsections?.[0].id).toBe("spritz");
  });
});

describe("a pop-up kitchen's chapter", () => {
  it("names its series by slug, published or not", () => {
    expect(popupSeriesSlug("chez-pickle")).toBe("chez-pickle");
    expect(popupSeriesSlug("series-chez-pickle")).toBe("chez-pickle");
    expect(popupSeriesSlug(null)).toBe("");
  });

  it("carries the series on the chapter, and nothing on the others", () => {
    const chapter = { id: "food", title: "Food", kind: "kitchen", items: [] };
    expect(
      mapFlatSection({ ...chapter, popupSeriesId: "series-chez-pickle" }),
    ).toMatchObject({ kind: "kitchen", popupSeriesId: "chez-pickle" });
    expect(mapFlatSection(chapter)).not.toHaveProperty("popupSeriesId");
  });
});
