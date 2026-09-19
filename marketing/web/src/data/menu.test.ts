import { describe, expect, it } from "vitest";
import {
  getAvailableItems,
  getSection,
  getSignatureCocktails,
} from "./menu";
import type { Menu } from "../types/menu";

const sampleImage = {
  url: "https://cdn.sanity.io/images/demo/development/abc-800x1000.jpg?w=900",
  width: 800,
  height: 1000,
  alt: "Wick Lantern Sour",
};

const sampleMenu: Menu = {
  sections: [
    {
      id: "signature-cocktails",
      title: "Signature Cocktails",
      items: [
        {
          id: "a",
          name: "Wick Lantern Sour",
          price: "14",
          drinkType: "cocktail",
          image: sampleImage,
          notes: "Aperitif",
        },
        { id: "b", name: "Canal Bloom", description: "Rye, smoke", drinkType: "cocktail" },
        {
          id: "c",
          name: "Hidden",
          available: false,
          drinkType: "cocktail",
          image: sampleImage,
        },
        { id: "d", name: "House Negroni", drinkType: "pour", image: sampleImage },
      ],
    },
    {
      id: "wines",
      title: "Natural Wines",
      items: [{ id: "w1", name: "By the Glass", drinkType: "pour" }],
    },
  ],
};

describe("getSection", () => {
  it("finds a section by slug id", () => {
    expect(getSection(sampleMenu, "signature-cocktails")?.title).toBe("Signature Cocktails");
  });
});

describe("getAvailableItems", () => {
  it("excludes items marked unavailable", () => {
    const cocktails = getSection(sampleMenu, "signature-cocktails")!;
    expect(getAvailableItems(cocktails).map((item) => item.id)).toEqual([
      "a",
      "b",
      "d",
    ]);
  });
});

describe("getSignatureCocktails", () => {
  it("returns cocktail photos from any section", () => {
    const signatures = getSignatureCocktails(sampleMenu);
    expect(signatures).toHaveLength(1);
    expect(signatures[0]?.name).toBe("Wick Lantern Sour");
    expect(signatures[0]?.image.url).toBe(sampleImage.url);
  });

  it("excludes non-cocktails and cocktails without images", () => {
    const menu: Menu = {
      sections: [
        {
          id: "drinks",
          title: "Drinks",
          items: [
            { id: "a", name: "With photo", drinkType: "cocktail", image: sampleImage },
            { id: "b", name: "No photo", drinkType: "cocktail" },
            { id: "c", name: "Bottled beer", drinkType: "packaged", image: sampleImage },
          ],
        },
      ],
    };
    expect(getSignatureCocktails(menu)).toHaveLength(1);
    expect(getSignatureCocktails(menu)[0]?.name).toBe("With photo");
  });
});
