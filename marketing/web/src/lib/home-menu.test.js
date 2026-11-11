import { describe, expect, it } from "vitest";
import { fromPrice, menuTaste, poundPrice } from "./home-menu.js";

const drink = (name, price, extra = {}) => ({
  id: name,
  name,
  price,
  ...extra,
});

const bar = [
  {
    id: "our-own",
    title: "Our Own",
    items: [
      drink("Gwenda", "13", { description: "Roku gin, basil" }),
      drink("The Wick", "11"),
      drink("Off tonight", "11", { available: false }),
      drink("Ponente", "11"),
    ],
  },
  {
    id: "old-favourites",
    title: "Old Favourites",
    items: [],
    subsections: [
      {
        id: "spritz",
        title: "Spritz",
        items: [drink("Aperol Spritz", "9"), drink("Hugo Spritz", "10")],
      },
      {
        id: "draught",
        title: "On Draught",
        items: [
          drink("Gwenda Pilsner", "", {
            prices: [
              { name: "Pint", price: "6.5" },
              { name: "Half", price: "3.5" },
            ],
          }),
        ],
      },
      { id: "empty", title: "Wine", items: [] },
    ],
  },
];

describe("poundPrice", () => {
  it("writes whole pounds plainly and pence in full", () => {
    expect(poundPrice("9")).toBe("£9");
    expect(poundPrice("3.5")).toBe("£3.50");
    expect(poundPrice("")).toBe("");
    expect(poundPrice("ask")).toBe("");
  });
});

describe("fromPrice", () => {
  it("is the cheapest of every size", () => {
    expect(fromPrice(bar[1].subsections[1].items)).toBe("£3.50");
    expect(fromPrice([drink("No price", "")])).toBe("");
  });
});

describe("menuTaste", () => {
  it("lists the first chapter's drinks that are on, with prices", () => {
    const taste = menuTaste(bar, { count: 2 });
    expect(taste.lead).toEqual({
      id: "our-own",
      title: "Our Own",
      total: 3,
      items: [
        { name: "Gwenda", description: "Roku gin, basil", price: "£13" },
        { name: "The Wick", description: "", price: "£11" },
      ],
    });
  });

  it("names every other part with what it starts from, linked to its chapter", () => {
    expect(menuTaste(bar).more).toEqual([
      { id: "old-favourites", title: "Spritz", from: "£9" },
      { id: "old-favourites", title: "On Draught", from: "£3.50" },
    ]);
  });

  it("is null for a menu with nothing on it", () => {
    expect(menuTaste([])).toBeNull();
    expect(menuTaste([{ id: "food", title: "Food", items: [] }])).toBeNull();
  });
});
