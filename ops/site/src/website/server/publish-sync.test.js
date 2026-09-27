import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
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
