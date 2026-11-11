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
      href: "/bar#our-own",
      title: "Our Own",
      total: 3,
      items: [
        { name: "Gwenda", description: "Roku gin, basil", price: "£13" },
        { name: "The Wick", description: "", price: "£11" },
      ],
    });
  });

  it("names every other part with what it starts from, linked to its own place", () => {
    expect(menuTaste(bar).more).toEqual([
      { href: "/bar#spritz", title: "Spritz", from: "£9" },
      { href: "/bar#draught", title: "On Draught", from: "£3.50" },
    ]);
  });

  it("links a chapter with items of its own to the chapter", () => {
    const noBooze = {
      id: "dry-ship",
      title: "No Booze",
      items: [drink("Dry Spritz", "7")],
    };
    expect(menuTaste([...bar, noBooze]).more.at(-1)).toEqual({
      href: "/bar#dry-ship",
      title: "No Booze",
      from: "£7",
    });
  });

  it("leaves out a part with nothing on, or with everything off", () => {
    const off = {
      id: "specials",
      title: "Specials",
      items: [drink("Last week's", "8", { available: false })],
    };
    const titles = menuTaste([...bar, off]).more.map((part) => part.title);
    expect(titles).toEqual(["Spritz", "On Draught"]);
  });

  it("sends the food menu's parts to the food page", () => {
    const kitchen = [
      {
        id: "chez-pickle",
        title: "Chez Pickle",
        kind: "kitchen",
        popupSeriesId: "chez-pickle",
        items: [],
        subsections: [
          { id: "burgers", title: "Burgers", items: [drink("The OG", "11")] },
          { id: "fries", title: "Fries", items: [drink("Fries", "4.5")] },
        ],
      },
    ];
    const taste = menuTaste(kitchen);
    expect(taste.lead.href).toBe("/kitchen#burgers");
    expect(taste.more).toEqual([
      { href: "/kitchen#fries", title: "Fries", from: "£4.50" },
    ]);
  });

  it("is null for a menu with nothing on it", () => {
    expect(menuTaste([])).toBeNull();
    expect(menuTaste([{ id: "food", title: "Food", items: [] }])).toBeNull();
  });
});
