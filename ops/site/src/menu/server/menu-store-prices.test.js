import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { PRICES_FIELD, itemFieldsFromInput, mapItem, rowHasField } from "./menu-store.js";

const wine = [
  { name: "125 ml", size: "125 ml", price: "7", sku: "G1" },
  { name: "175 ml", size: "175 ml", price: "9", sku: "G2" },
  { name: "Bottle", price: "32", sku: "G3" },
];

describe("menu item prices in Baserow", () => {
  it("writes the table as JSON and its first two rows into the old columns", () => {
    const fields = itemFieldsFromInput(
      { name: "House red", drinkType: "pour", prices: wine },
      { requireSection: false, pricesGiven: true, pricesColumn: true },
    );
    assert.equal(fields.Price, "7");
    assert.equal(fields["Alt price"], "9");
    assert.equal(fields["Lightspeed SKU"], "G1");
    assert.equal(fields["Lightspeed SKU alt"], "G2");
    assert.deepEqual(JSON.parse(fields[PRICES_FIELD]), wine);
  });

  it("leaves the Prices column out until the table has it", () => {
    const fields = itemFieldsFromInput(
      { name: "House red", drinkType: "pour", prices: wine },
      { requireSection: false, pricesGiven: true, pricesColumn: false },
    );
    assert.equal(PRICES_FIELD in fields, false);
    assert.equal(fields.Price, "7");
    assert.equal(fields["Alt price"], "9");
  });

  it("clears a till SKU taken out of the table, but not when only the old fields were sent", () => {
    const cleared = itemFieldsFromInput(
      { name: "Gin", prices: [{ name: "Single", price: "8" }] },
      { requireSection: false, pricesGiven: true },
    );
    assert.equal(cleared["Lightspeed SKU"], "");
    assert.equal(cleared["Lightspeed SKU alt"], "");
    const old = itemFieldsFromInput({ name: "Gin", price: "8" }, { requireSection: false });
    assert.equal("Lightspeed SKU" in old, false);
  });

  it("lays a price sent on its own over the stored rows", () => {
    const fields = itemFieldsFromInput(
      { name: "House red", prices: wine, price: "7.50" },
      { requireSection: false, pricesColumn: true },
    );
    assert.equal(fields.Price, "7.50");
    assert.equal(JSON.parse(fields[PRICES_FIELD])[2].price, "32");
  });

  it("reads the table, or the old columns when the Prices column is empty or missing", () => {
    const base = { id: 7, Name: "House red", "Drink type": { value: "pour" }, Price: "7", "Alt price": "9" };
    assert.deepEqual(mapItem({ ...base, [PRICES_FIELD]: JSON.stringify(wine), "Lightspeed SKU": "G1", "Lightspeed SKU alt": "G2" }).prices, wine);
    assert.deepEqual(mapItem({ ...base, [PRICES_FIELD]: "" }).prices, [
      { name: "Single", size: "25 ml", price: "7" },
      { name: "Double", size: "50 ml", price: "9" },
    ]);
    assert.deepEqual(mapItem(base).prices, mapItem({ ...base, [PRICES_FIELD]: null }).prices);
  });

  it("knows the column is there from any row Baserow returns", () => {
    assert.equal(rowHasField({ id: 1, Prices: null }, PRICES_FIELD), true);
    assert.equal(rowHasField({ id: 1 }, PRICES_FIELD), false);
    assert.equal(rowHasField(undefined, PRICES_FIELD), false);
  });
});
