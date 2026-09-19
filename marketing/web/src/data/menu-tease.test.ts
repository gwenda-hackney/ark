import { describe, expect, it } from "vitest";
import { getMenuTeaseCocktails, hasLiveMenuCocktails } from "./menu-tease";
import type { Menu } from "../types/menu";

const sampleImage = {
  url: "https://cdn.sanity.io/images/demo/development/abc-800x1000.jpg?w=900",
  width: 800,
  height: 1000,
};

const sampleMenu: Menu = {
  sections: [
    {
      id: "cocktails",
      title: "Cocktails",
      items: [
        {
          id: "1",
          name: "Wick Lantern Sour",
          price: "14",
          drinkType: "cocktail",
          image: sampleImage,
        },
        { id: "2", name: "Canal Bloom", price: "15", drinkType: "cocktail" },
      ],
    },
    {
      id: "wines",
      title: "Natural Wines",
      items: [{ id: "w1", name: "By the Glass", drinkType: "pour" }],
    },
  ],
};

describe("getMenuTeaseCocktails", () => {
  it("returns cocktails with CMS images", () => {
    const cocktails = getMenuTeaseCocktails(sampleMenu);
    expect(cocktails).toHaveLength(1);
    expect(cocktails[0]?.name).toBe("Wick Lantern Sour");
    expect(cocktails[0]?.image.url).toBe(sampleImage.url);
  });

  it("returns an empty list when no cocktails have photos", () => {
    const cocktails = getMenuTeaseCocktails({ sections: [] });
    expect(cocktails).toHaveLength(0);
  });
});

describe("hasLiveMenuCocktails", () => {
  it("is true when cocktails with images exist", () => {
    expect(hasLiveMenuCocktails(sampleMenu)).toBe(true);
  });

  it("is false when cocktails section is empty", () => {
    expect(hasLiveMenuCocktails({ sections: [] })).toBe(false);
  });
});
