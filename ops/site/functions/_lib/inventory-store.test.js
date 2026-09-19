import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mapInventoryItem, parseQty } from "./inventory-store.js";

describe("parseQty", () => {
  it("parses numbers and blanks", () => {
    assert.equal(parseQty(6), 6);
    assert.equal(parseQty("6.250"), 6.25);
    assert.equal(parseQty(""), null);
    assert.equal(parseQty(undefined), null);
  });
});

describe("mapInventoryItem", () => {
  it("maps on-hand qty, unit, and counted at", () => {
    const item = mapInventoryItem({
      id: 12,
      Name: "Campari",
      Kind: "liqueur",
      "Actual qty": 6,
      "Actual unit": "btl",
      "Counted at": "2026-09-19T08:00:00.000Z",
    });
    assert.equal(item.actualQty, 6);
    assert.equal(item.actualUnit, "btl");
    assert.equal(item.countedAt, "2026-09-19T08:00:00.000Z");
  });

  it("omits on-hand qty when the count is empty", () => {
    const item = mapInventoryItem({
      id: 13,
      Name: "Lemon",
      Kind: "garnish",
    });
    assert.equal(item.actualQty, undefined);
    assert.equal(item.actualUnit, undefined);
    assert.equal(item.countedAt, undefined);
  });
});
