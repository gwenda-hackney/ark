import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { itemFieldsFromInput, mapItem } from "./menu-store.js";

const wine = [
  { name: "125 ml", size: "125 ml", price: "7", sku: "G1" },
  { name: "175 ml", size: "175 ml", price: "9", sku: "G2" },
  { name: "Bottle", price: "32", sku: "G3" },
];

describe("menu item prices", () => {
  it("writes the table and its first two rows into the old fields", () => {
    const fields = itemFieldsFromInput(
      { name: "House red", drinkType: "pour", prices: wine },
      { requireSection: false, pricesGiven: true },
    );
    assert.equal(fields.price, "7");
    assert.equal(fields.altPrice, "9");
    assert.equal(fields.lightspeedSku, "G1");
    assert.equal(fields.lightspeedSkuAlt, "G2");
    assert.deepEqual(fields.prices, wine);
  });

  it("clears a till SKU taken out of the table, but not when only the old fields were sent", () => {
    const cleared = itemFieldsFromInput(
      { name: "Gin", prices: [{ name: "Single", price: "8" }] },
      { requireSection: false, pricesGiven: true },
    );
    assert.equal(cleared.lightspeedSku, "");
    assert.equal(cleared.lightspeedSkuAlt, "");
    const old = itemFieldsFromInput({ name: "Gin", price: "8" }, { requireSection: false });
    assert.equal("lightspeedSku" in old, false);
  });

  it("lays a price sent on its own over the stored rows", () => {
    const fields = itemFieldsFromInput(
      { name: "House red", prices: wine, price: "7.50" },
      { requireSection: false },
    );
    assert.equal(fields.price, "7.50");
    assert.equal(fields.prices[2].price, "32");
  });

  it("reads the table, or the old fields when there is none", () => {
    const base = { id: 7, name: "House red", drinkType: "pour", price: "7", altPrice: "9" };
    assert.deepEqual(mapItem({ ...base, prices: wine, lightspeedSku: "G1", lightspeedSkuAlt: "G2" }).prices, wine);
    assert.deepEqual(mapItem({ ...base, prices: null }).prices, [
      { name: "Single", size: "25 ml", price: "7" },
      { name: "Double", size: "50 ml", price: "9" },
    ]);
    assert.deepEqual(mapItem(base).prices, mapItem({ ...base, prices: [] }).prices);
  });
});
