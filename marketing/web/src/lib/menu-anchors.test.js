import { describe, expect, it } from "vitest";
import { menuAddresses, menuPage } from "./menu-anchors.js";

const section = (id, extra = {}) => ({ id, title: id, items: [], ...extra });

describe("menuPage", () => {
  it("is the drinks page for the bar's menu and the food page for the kitchen's", () => {
    expect(menuPage("bar")).toBe("/bar");
    expect(menuPage("kitchen")).toBe("/kitchen");
  });

  it("is the drinks page for a chapter with no kind", () => {
    expect(menuPage(undefined)).toBe("/bar");
  });
});

describe("menuAddresses", () => {
  it("names a chapter by its slug, as the menu pages always have", () => {
    const classics = section("by-the-book", { kind: "bar" });
    expect(menuAddresses([classics])(classics)).toEqual({
      page: "/bar",
      anchor: "by-the-book",
      href: "/bar#by-the-book",
    });
  });

  it("names a group by its own slug, on its chapter's page", () => {
    // A group has no kind of its own in Sanity; the website reads that as "bar"
    const burgers = section("burgers", { kind: "bar" });
    const popup = section("chez-pickle", {
      kind: "kitchen",
      popupSeriesId: "chez-pickle",
      subsections: [burgers],
    });
    const where = menuAddresses([popup]);
    expect(where(popup).href).toBe("/kitchen#chez-pickle");
    expect(where(burgers).href).toBe("/kitchen#burgers");
  });

  it("goes by the slug, never the title", () => {
    const negroni = section("negroni", { title: "Bitter and red" });
    const classics = section("by-the-book", { subsections: [negroni] });
    expect(menuAddresses([classics])(negroni).anchor).toBe("negroni");
  });

  it("makes an id of a document id, for a section with no slug", () => {
    const draft = section("drafts.a1B2-c3.d4");
    const spaced = section(" Fries & dips ");
    const where = menuAddresses([draft, spaced]);
    expect(where(draft).anchor).toBe("a1B2-c3-d4");
    expect(where(spaced).anchor).toBe("Fries-dips");
  });

  it("gives no two sections on a page the same id, chapters keeping theirs", () => {
    const group = section("beer");
    const first = section("cocktails", { subsections: [group] });
    const beer = section("beer", { subsections: [section("beer")] });
    const where = menuAddresses([first, beer]);
    expect(where(beer).anchor).toBe("beer");
    expect(where(group).anchor).toBe("beer-2");
    expect(where(beer.subsections[0]).anchor).toBe("beer-3");
  });

  it("lets the drinks and the food each have a section of the same name", () => {
    const drinks = section("specials", { kind: "bar" });
    const food = section("specials", { kind: "kitchen" });
    const where = menuAddresses([drinks, food]);
    expect(where(drinks).href).toBe("/bar#specials");
    expect(where(food).href).toBe("/kitchen#specials");
  });

  it("still names a section that has neither slug nor id", () => {
    const nameless = section("");
    expect(menuAddresses([nameless])(nameless).anchor).toBe("section");
  });

  it("knows nothing of a section that isn't on the menu", () => {
    expect(menuAddresses([])(section("elsewhere"))).toBeUndefined();
  });
});
