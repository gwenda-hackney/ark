import { describe, expect, it } from "vitest";
import { isBeerChapter, menuRows } from "./menu-layout.js";

const chapter = (id, drinkType, subsections) => ({
  id,
  title: id,
  items: drinkType ? [{ id: `${id}-1`, name: id, drinkType }] : [],
  subsections,
});

const ownCocktails = chapter("our-own", "cocktail");
const classics = chapter("old-favourites", "cocktail");
const beer = chapter("beer", null, [
  chapter("draught", "beer"),
  chapter("bottles", "packaged"),
]);
const noBooze = chapter("dry-ship", "cocktail");
const spirits = chapter("the-hold", "pour");

const ids = (entries) => entries.map(({ chapter: c }) => c.id);

describe("isBeerChapter", () => {
  it("is a chapter where everything is beer, draught or bottled", () => {
    expect(isBeerChapter(beer)).toBe(true);
    expect(isBeerChapter(classics)).toBe(false);
  });

  it("is not one with a cocktail among the beers", () => {
    expect(
      isBeerChapter(chapter("mixed", "beer", [chapter("spritz", "cocktail")])),
    ).toBe(false);
  });

  it("ignores a beer that is off", () => {
    const off = {
      id: "off",
      name: "Off",
      drinkType: "cocktail",
      available: false,
    };
    expect(
      isBeerChapter({
        ...chapter("draught", "beer"),
        items: [{ id: "a", name: "A", drinkType: "beer" }, off],
      }),
    ).toBe(true);
  });
});

describe("menuRows", () => {
  it("puts the first two chapters side by side, then the beer across, then the rest", () => {
    const rows = menuRows([ownCocktails, classics, beer, noBooze, spirits]);
    expect(rows.map((row) => row.layout)).toEqual([
      "columns",
      "band",
      "columns",
    ]);
    expect(rows[0].columns.map(ids)).toEqual([["our-own"], ["old-favourites"]]);
    expect(ids(rows[1].chapters)).toEqual(["beer"]);
    expect(rows[2].columns.map(ids)).toEqual([["dry-ship"], ["the-hold"]]);
  });

  it("deals chapters left then right when there is no beer chapter", () => {
    const [row] = menuRows([ownCocktails, classics, noBooze, spirits]);
    expect(row.columns.map(ids)).toEqual([
      ["our-own", "dry-ship"],
      ["old-favourites", "the-hold"],
    ]);
  });

  it("keeps each chapter's place in the order, for a phone", () => {
    const rows = menuRows([ownCocktails, classics, beer, noBooze]);
    expect(rows[1].chapters[0].order).toBe(2);
    expect(rows[2].columns[0][0].order).toBe(3);
  });

  it("flows a menu of one chapter down both columns", () => {
    expect(menuRows([spirits])).toEqual([
      { layout: "flow", chapters: [{ chapter: spirits, order: 0 }] },
    ]);
  });

  it("is empty for an empty menu", () => {
    expect(menuRows([])).toEqual([]);
  });
});
