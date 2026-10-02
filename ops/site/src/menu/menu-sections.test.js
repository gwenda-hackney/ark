import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  countSectionItems,
  flattenMenuSections,
  nestMenuSections,
  removeItemFromSections,
  sectionPathLabel,
  upsertItemInSections,
} from "./menu-sections.js";

describe("nestMenuSections", () => {
  it("nests print subsections under chapters", () => {
    const nested = nestMenuSections([
      { _id: "5", title: "By the Book", orderRank: 3, parentId: null, items: [] },
      { _id: "6", title: "Spritz", orderRank: 4, parentId: "5", items: [{ name: "Aperol Spritz" }] },
      { _id: "16", title: "Draught Beer", orderRank: 9, parentId: "5", items: [] },
      { _id: "3", title: "Our Formulas", orderRank: 1, parentId: null, items: [{ name: "Gwenda" }] },
    ]);
    assert.deepEqual(
      nested.map((section) => section.title),
      ["Our Formulas", "By the Book"],
    );
    assert.deepEqual(
      nested[1].subsections.map((section) => section.title),
      ["Spritz", "Draught Beer"],
    );
    assert.equal(nested[1].subsections[0].items[0].name, "Aperol Spritz");
    assert.equal(countSectionItems(nested[1]), 1);
    assert.equal(countSectionItems(nested[0]), 1);
  });
});

describe("flattenMenuSections", () => {
  it("walks the tree for dropdowns and drink lookup", () => {
    const flat = flattenMenuSections(
      nestMenuSections([
        { _id: "a", title: "The Cabinet", parentId: null },
        { _id: "b", title: "Amaro", parentId: "a", parentTitle: "The Cabinet" },
      ]),
    );
    assert.deepEqual(
      flat.map((section) => sectionPathLabel(section)),
      ["The Cabinet", "The Cabinet / Amaro"],
    );
  });
});

describe("upsertItemInSections", () => {
  it("moves a drink between nested sections without a full reload", () => {
    const tree = nestMenuSections([
      {
        _id: "3",
        title: "Our Formulas",
        parentId: null,
        items: [{ _id: "10", name: "Gwenda", sectionId: "3", orderRank: 1 }],
      },
      { _id: "5", title: "By the Book", parentId: null, items: [] },
      { _id: "6", title: "Spritz", parentId: "5", items: [] },
    ]);
    const next = upsertItemInSections(tree, {
      _id: "10",
      name: "Gwenda",
      sectionId: "6",
      orderRank: 1,
    });
    const formulas = next.find((section) => section._id === "3");
    const book = next.find((section) => section._id === "5");
    assert.equal(formulas.items.length, 0);
    assert.equal(book.subsections[0].items[0].name, "Gwenda");
  });

  it("removes a drink from the tree", () => {
    const tree = [
      { _id: "3", title: "Our Formulas", items: [{ _id: "10", name: "Gwenda" }] },
    ];
    const next = removeItemFromSections(tree, "10");
    assert.deepEqual(next[0].items, []);
  });
});
