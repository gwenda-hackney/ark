/**
 * What ops' scheduler counts on from menu-day.js (#306): it runs
 * MENU_DAY_QUERY on a site's Sanity view, with `$from` the build's day, and
 * rebuilds the site when menuDayKeyFrom differs between the build's day and
 * today (ops/site/src/website/server/site-pending.js menusChangedSince).
 * The documents here are shaped as ops' Update website writes them
 * (publish-sync.js: menu documents, chapters with a weak `menu` link) and
 * as events publishing writes pop-up nights. A change here that would stop
 * the rebuild fails here.
 */
import { evaluate, parse } from "groq-js";
import { describe, expect, it } from "vitest";
import { MENU_DAY_QUERY, menuDayKeyFrom } from "./menu-day.js";

const ref = (id, extra = {}) => ({ _type: "reference", _ref: id, ...extra });

const DOCS = [
  {
    _id: "series-chez-pickle",
    _type: "eventSeries",
    slug: { current: "chez-pickle" },
    title: "Chez Pickle",
    category: "popup",
  },
  ...["2026-11-26", "2026-11-27", "2026-11-28"].map((date) => ({
    _id: `night-${date}`,
    _type: "event",
    seriesId: "chez-pickle",
    category: "popup",
    date,
  })),
  {
    _id: "menu-1",
    _type: "menu",
    slug: { current: "dinner" },
    name: "Dinner",
    kind: "kitchen",
    days: ["thu", "fri"],
    popupSeries: ref("series-chez-pickle"),
    orderRank: "0|i00000001s:",
  },
  {
    _id: "menu-2",
    _type: "menu",
    slug: { current: "brunch" },
    name: "Brunch",
    kind: "kitchen",
    days: ["sat"],
    popupSeries: ref("series-chez-pickle"),
    orderRank: "0|i00000002s:",
  },
  {
    _id: "s1",
    _type: "menuSection",
    slug: { current: "small-plates" },
    kind: "kitchen",
    menu: ref("menu-1", { _weak: true }),
  },
  {
    _id: "s2",
    _type: "menuSection",
    slug: { current: "eggs" },
    kind: "kitchen",
    menu: ref("menu-2", { _weak: true }),
  },
  {
    _id: "g1",
    _type: "menuSection",
    slug: { current: "fried" },
    parent: ref("s1"),
  },
  { _id: "i1", _type: "menuItem", name: "Fried pickles", section: ref("g1") },
  { _id: "i2", _type: "menuItem", name: "Shakshuka", section: ref("s2") },
];

async function run(from) {
  return (
    await evaluate(parse(MENU_DAY_QUERY), { dataset: DOCS, params: { from } })
  ).get();
}

describe("the menus of the day, for ops' scheduler", () => {
  it("differs when today's menu differs from the build day's, so the site is rebuilt", async () => {
    const result = await run("2026-11-27");
    // Built on Friday (dinner), today is Saturday (brunch)
    expect(menuDayKeyFrom(result, "2026-11-27")).not.toBe(
      menuDayKeyFrom(result, "2026-11-28"),
    );
  });

  it("is the same on days that show the same, so nothing is rebuilt", async () => {
    const result = await run("2026-11-26");
    // Thursday and Friday: dinner both days
    expect(menuDayKeyFrom(result, "2026-11-26")).toBe(
      menuDayKeyFrom(result, "2026-11-27"),
    );
  });

  it("counts a chapter whose items sit in its groups as filled", async () => {
    const result = await run("2026-11-26");
    expect(
      result.chapters.map((chapter) => [
        chapter.id,
        chapter.menuId,
        chapter.filled,
      ]),
    ).toEqual([
      ["small-plates", "dinner", true],
      ["eggs", "brunch", true],
    ]);
  });
});
