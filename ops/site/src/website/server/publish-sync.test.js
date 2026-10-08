import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  linkedSectionPatch,
  orderRankFromOrder,
  slugifySection,
} from "./publish-sync.js";
import {
  changedFields,
  websiteProjection,
} from "../../inventory/server/reconcile.js";

describe("slugifySection", () => {
  it("slugifies titles", () => {
    assert.equal(slugifySection("Our Formulas"), "our-formulas");
    assert.equal(slugifySection("  Amaro & Digestivi "), "amaro-digestivi");
  });

  it("falls back when empty", () => {
    assert.equal(slugifySection(""), "section");
    assert.equal(slugifySection("@@@", "x"), "x");
  });
});

describe("orderRankFromOrder", () => {
  it("pads numeric order into a sortable rank", () => {
    assert.equal(orderRankFromOrder(3, "item"), "0|i00000003i:");
    assert.equal(orderRankFromOrder(12, "section"), "0|i00000012s:");
  });
});

describe("websiteProjection section", () => {
  it("includes sectionId so moves republish", () => {
    const a = websiteProjection({
      name: "Gwenda",
      sectionId: "10",
      price: "14",
      drinkType: "cocktail",
    });
    const b = websiteProjection({
      name: "Gwenda",
      sectionId: "11",
      price: "14",
      drinkType: "cocktail",
    });
    assert.equal(a.sectionId, "10");
    assert.deepEqual(changedFields(b, a), ["sectionId"]);
  });
});

describe("linkedSectionPatch", () => {
  const current = { title: "Our Formulas", subtitle: "", parent: null };

  it("renames a section already on the website", () => {
    assert.deepEqual(linkedSectionPatch({ title: "Our Own" }, current, null), {
      set: { title: "Our Own" },
    });
  });

  it("is null when the website already matches", () => {
    assert.equal(linkedSectionPatch({ title: "Our Formulas" }, current, null), null);
  });

  it("moves a section to its place in the ops order", () => {
    assert.deepEqual(
      linkedSectionPatch(
        { title: "Dry Ship", orderRank: 3 },
        { title: "Dry Ship", orderRank: "0|10000o:" },
        null,
      ),
      { set: { orderRank: "0|i00000003s:" } },
    );
    assert.equal(
      linkedSectionPatch(
        { title: "Dry Ship", orderRank: 3 },
        { title: "Dry Ship", orderRank: "0|i00000003s:" },
        null,
      ),
      null,
    );
  });

  it("sets or clears the subtitle and the parent", () => {
    assert.deepEqual(
      linkedSectionPatch({ title: "Rum", subtitle: "From the islands" }, { title: "Rum" }, "s-11"),
      {
        set: { subtitle: "From the islands", parent: { _type: "reference", _ref: "s-11" } },
      },
    );
    assert.deepEqual(
      linkedSectionPatch({ title: "Rum" }, { title: "Rum", subtitle: "Old", parent: "s-11" }, null),
      { unset: ["subtitle", "parent"] },
    );
  });
});
