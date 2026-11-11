/**
 * What home's menu panels (lib/home-menu.js) and a pop-up kitchen's "See
 * the menu" (lib/popup-kitchen.js) count on from the menu pages
 * (lib/menu-layout.js): every link they write lands on the heading of the
 * section it names, on the right page. The menu here is as Sanity sends it
 * (MENU_QUERY), so the whole way from the data to both pages is covered.
 */
import { describe, expect, it } from "vitest";
import { menuChapters } from "../data/menu";
import { menuTaste } from "./home-menu.js";
import { menuSheet } from "./menu-layout.js";
import { popupMenuHref } from "./popup-kitchen.js";
import { mapFlatSection, nestMenuSections } from "./sanity/menu";

const item = (name, price) => ({ id: `item-${name}`, name, price });

/** A section as MENU_QUERY returns it: `kind` on chapters only. */
const section = (id, title, extra = {}) => ({ id, title, items: [], ...extra });

const docs = [
  section("our-formulas", "Our Cocktails", {
    kind: "bar",
    items: [item("Gwenda", "13"), item("The Wick", "11")],
  }),
  section("by-the-book", "The Classics", { kind: "bar" }),
  section("spritz", "Spritz", {
    parentId: "by-the-book",
    items: [item("Aperol Spritz", "9")],
  }),
  section("negroni", "Negroni", {
    parentId: "by-the-book",
    items: [item("Negroni", "9"), item("Sbagliato", "10")],
  }),
  // A group and a chapter with nothing on them yet
  section("wine", "Wine", { parentId: "by-the-book" }),
  section("specials", "Specials", { kind: "bar" }),
  // A chapter with drinks of its own and no groups
  section("free-of-spirit", "No Booze", {
    kind: "bar",
    items: [item("Dry Spritz", "7")],
  }),
  // A pop-up kitchen's chapter: food, its groups under it
  section("chez-pickle", "Chez Pickle", {
    kind: "kitchen",
    popupSeriesId: "series-chez-pickle",
  }),
  section("burgers", "Burgers", {
    parentId: "chez-pickle",
    items: [item("The OG", "11")],
  }),
  section("fries-and-dips", "Fries and dips", {
    parentId: "chez-pickle",
    items: [item("Fries", "4.5")],
  }),
];

/** The menu as the website reads it (fetchMenu). */
function menuFrom(rows) {
  return { sections: nestMenuSections(rows.map(mapFlatSection)) };
}

/** Every heading a menu page draws, with the id on it: what a link can land on. */
function headings(chapters) {
  const { rows } = menuSheet(chapters);
  return rows
    .flatMap((row) =>
      row.layout === "columns" ? row.columns.flat() : row.chapters,
    )
    .flatMap(({ chapter, id, groups }) => [
      { id, title: chapter.title },
      ...groups
        .filter(({ section: group }) => group !== chapter)
        .map(({ section: group, id: groupId }) => ({
          id: groupId,
          title: group.title,
        })),
    ]);
}

/** Home's links for one menu: the "and N more" line, then each tile. */
function homeLinks(chapters) {
  const taste = menuTaste(chapters, { count: 1 });
  return [taste.lead, ...taste.more].map(({ href, title }) => ({
    href,
    title,
  }));
}

/** The heading(s) a link lands on: the page it goes to, and what is there. */
function landing(href, menu) {
  const [page, anchor] = href.split("#");
  const kind = { "/bar": "bar", "/kitchen": "kitchen" }[page];
  return {
    page,
    titles: headings(menuChapters(menu, kind))
      .filter((heading) => heading.id === anchor)
      .map((heading) => heading.title),
  };
}

describe("home's menu links", () => {
  const menu = menuFrom(docs);

  it("each land on the heading of the section they name, on the drinks page: a chapter each", () => {
    const links = homeLinks(menuChapters(menu, "bar"));
    expect(links.map((link) => link.title)).toEqual([
      "Our Cocktails",
      "The Classics",
      "No Booze",
    ]);
    for (const link of links) {
      expect(landing(link.href, menu), link.title).toEqual({
        page: "/bar",
        titles: [link.title],
      });
    }
  });

  it("each land on their own section of the food page, a pop-up kitchen's too", () => {
    const links = homeLinks(menuChapters(menu, "kitchen"));
    expect(links.map((link) => link.title)).toEqual([
      "Burgers",
      "Fries and dips",
    ]);
    for (const link of links) {
      expect(landing(link.href, menu), link.title).toEqual({
        page: "/kitchen",
        titles: [link.title],
      });
    }
  });

  it("are for sections with something on, and only those", () => {
    const titles = homeLinks(menuChapters(menu, "bar")).map((l) => l.title);
    expect(titles).not.toContain("Wine");
    expect(titles).not.toContain("Specials");
    const drawn = headings(menuChapters(menu, "bar")).map((h) => h.title);
    expect(drawn).not.toContain("Wine");
    expect(drawn).not.toContain("Specials");
  });

  it("stay where they are when staff rename a section", () => {
    const renamed = menuFrom(
      docs.map((doc) =>
        doc.id === "by-the-book" ? { ...doc, title: "Old school" } : doc,
      ),
    );
    const before = homeLinks(menuChapters(menu, "bar")).map((l) => l.href);
    const after = homeLinks(menuChapters(renamed, "bar"));
    expect(after.map((link) => link.href)).toEqual(before);
    expect(after[1].title).toBe("Old school");
    expect(landing(after[1].href, renamed).titles).toEqual(["Old school"]);
  });

  it("give every heading on a page an id of its own", () => {
    for (const kind of ["bar", "kitchen"]) {
      const ids = headings(menuChapters(menu, kind)).map((h) => h.id);
      expect(ids.every(Boolean), kind).toBe(true);
      expect(new Set(ids).size, kind).toBe(ids.length);
    }
  });
});

describe("a pop-up kitchen's See the menu", () => {
  it("lands on its chapter of the food page", () => {
    const menu = menuFrom(docs);
    const href = popupMenuHref("chez-pickle", menuChapters(menu, "kitchen"));
    expect(landing(href, menu)).toEqual({
      page: "/kitchen",
      titles: ["Chez Pickle"],
    });
  });
});
