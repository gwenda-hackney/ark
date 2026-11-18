import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { menuChangesByMenu } from "./menu-website.js";

/** Two menus: Dinner (1) with Mains and its Grill group, Drinks (2) with Cocktails. */
const tree = {
  sections: [
    { _id: "10", menuId: "1", sanityId: "s-mains", subsections: [{ _id: "11", parentId: "10", sanityId: "s-grill" }] },
    { _id: "20", menuId: "2", sanityId: "s-cocktails", subsections: [] },
  ],
  items: [
    { _id: "100", sectionId: "11", sanityId: "i-steak", placements: [{ channel: "digital", sectionId: "11" }] },
    { _id: "101", sectionId: "20", sanityId: "i-negroni", placements: [{ channel: "pos", sectionId: "10" }] },
    { _id: "102", sectionId: null, sanityId: "i-gone", placements: [] },
  ],
};
const none = { menus: [], sections: [], items: [], goneMenus: [] };

describe("menuChangesByMenu: what Update website would change, put down to each menu", () => {
  it("counts menus, sections (a group by its chapter's menu) and items by where they are", () => {
    assert.deepEqual(menuChangesByMenu({ ...none, menus: ["2"], sections: ["11"], items: ["100", "101"] }, [], tree), {
      menus: { 1: 2, 2: 2 },
      other: 0,
    });
  });

  it("counts what the preview has and the website doesn't, by its document", () => {
    const released = [
      { id: "s-grill", type: "menuSection" },
      { id: "i-negroni", type: "menuItem" },
      { id: "series-x", type: "eventSeries" },
    ];
    assert.deepEqual(menuChangesByMenu(none, released, tree), { menus: { 1: 1, 2: 1 }, other: 0 });
  });

  it("counts for every menu what belongs to none: a drink off every menu, a document ops doesn't know", () => {
    assert.deepEqual(menuChangesByMenu({ ...none, items: ["102"], goneMenus: ["menu-3"] }, [{ id: "i-old", type: "menuItem" }], tree), {
      menus: { 3: 1 },
      other: 2,
    });
  });
});
