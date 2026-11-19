import { describe, expect, it } from "vitest";
import {
  HOME_MENU_ITEMS,
  fromPrice,
  menuTaste,
  poundPrice,
} from "./home-menu.js";

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
  it("lists the same number on both boards, the first few of each first chapter, in menu order", () => {
    expect(HOME_MENU_ITEMS).toBe(3);
    const many = {
      id: "ours",
      title: "Ours",
      items: ["A", "B", "C", "D", "E"].map((name) => drink(name, "10")),
    };
    const taste = menuTaste([many]);
    expect(taste.lead.items.map((item) => item.name)).toEqual(["A", "B", "C"]);
    expect(taste.lead.total).toBe(5);
  });

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

  it("names every other chapter, in the menu's order, with the cheapest thing in it, linked to the chapter", () => {
    const noBooze = {
      id: "dry-ship",
      title: "No Booze",
      items: [drink("Dry Spritz", "7")],
    };
    expect(menuTaste([...bar, noBooze]).more).toEqual([
      { href: "/bar#old-favourites", title: "Old Favourites", from: "£3.50" },
      { href: "/bar#dry-ship", title: "No Booze", from: "£7" },
    ]);
  });

  it("counts a chapter's own drinks and its groups' alike for what it starts from", () => {
    const spirits = {
      id: "spirits",
      title: "Spirits",
      items: [drink("House pour", "4")],
      subsections: [
        { id: "rum", title: "Rum", items: [drink("Plantation", "6")] },
      ],
    };
    expect(menuTaste([...bar, spirits]).more.at(-1)).toEqual({
      href: "/bar#spirits",
      title: "Spirits",
      from: "£4",
    });
  });

  it("leaves out a chapter with nothing on, or with everything off", () => {
    const off = {
      id: "specials",
      title: "Specials",
      items: [drink("Last week's", "8", { available: false })],
    };
    const empty = {
      id: "wine",
      title: "Wine",
      items: [],
      subsections: [{ id: "red", title: "Red", items: [] }],
    };
    const titles = menuTaste([bar[0], off, bar[1], empty]).more.map(
      (part) => part.title,
    );
    expect(titles).toEqual(["Old Favourites"]);
  });

  it("names the first chapter's other groups when it is the only chapter with anything on", () => {
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
          { id: "sides", title: "Sides", items: [] },
        ],
      },
      { id: "closed", title: "Next pop-up", kind: "kitchen", items: [] },
    ];
    const taste = menuTaste(kitchen);
    expect(taste.lead.href).toBe("/kitchen#burgers");
    expect(taste.lead.title).toBe("Burgers");
    expect(taste.more).toEqual([
      { href: "/kitchen#fries", title: "Fries", from: "£4.50" },
    ]);
  });

  it("is null for a menu with nothing on it", () => {
    expect(menuTaste([])).toBeNull();
    expect(menuTaste([{ id: "food", title: "Food", items: [] }])).toBeNull();
  });
});

describe("menuTaste with a cap on the first chapter (the Drinks board beside two kitchens)", () => {
  const ours = (n) => ({
    id: "our-own",
    title: "Our Own",
    items: Array.from({ length: n }, (_, i) => drink(`Ours ${i + 1}`, "11")),
  });
  const beer = {
    id: "beer",
    title: "Beer",
    items: ["Pilsner", "IPA", "Stout", "Lager"].map((name) => drink(name, "6")),
  };
  const noBooze = {
    id: "no-booze",
    title: "No Booze",
    items: [drink("Dry Spritz", "7")],
  };
  const names = (taste) => [
    taste.lead.items.map((item) => item.name),
    ...taste.extra.map((part) => [
      part.title,
      ...part.items.map((item) => item.name),
    ]),
  ];

  it("lists at most the cap from the first, then fills from the parts after it, in the menu's order", () => {
    const taste = menuTaste([ours(8), beer, noBooze], { count: 9, lead: 6 });
    expect(names(taste)).toEqual([
      ["Ours 1", "Ours 2", "Ours 3", "Ours 4", "Ours 5", "Ours 6"],
      ["Beer", "Pilsner", "IPA", "Stout"],
    ]);
    expect(taste.lead.total).toBe(8);
    expect(taste.extra[0]).toMatchObject({ href: "/bar#beer", total: 4 });
    expect(taste.more.map((part) => part.title)).toEqual(["No Booze"]);
  });

  it("keeps about its length when cocktails come off: the next parts fill in, three of each at most", () => {
    const taste = menuTaste([ours(2), beer, noBooze], { count: 9, lead: 6 });
    expect(names(taste)).toEqual([
      ["Ours 1", "Ours 2"],
      ["Beer", "Pilsner", "IPA", "Stout"],
      ["No Booze", "Dry Spritz"],
    ]);
    expect(taste.extra[0].total).toBe(4);
    expect(taste.more).toEqual([]);
  });

  it("without a cap lists only the first chapter, as before", () => {
    expect(menuTaste([ours(2), beer]).extra).toEqual([]);
  });
});
