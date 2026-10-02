import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  cleanLwcName,
  diffLwcPriceLists,
  parseLwcPriceListCsv,
} from "./lwc-price-list.js";

describe("parseLwcPriceListCsv", () => {
  it("reads product rows and skips section headers", () => {
    const csv = [
      ",,Customer Price List,,,,,,16/09/2026",
      "Prod Code,,,Prod Name,,,UOM,Price,Last Sale",
      "120 - Keg Lager,,,,,,,,",
      "MSD87018,,,PILSNER LAGER 3.4% 50L,,,KEG11G,83.00,",
      "MLM14004,,[H],MARLISH PREMIUM LEMONADE 200ML NRB,,,CASE24,16.59,",
      "SPL47683,[S],[C],MONIN SYRUP SPICED RED BERRIES 70CL - CASE ONLY ORDER,,,BOTTLE,6.59,",
    ].join("\n");
    const bySku = parseLwcPriceListCsv(csv);
    assert.equal(Object.keys(bySku).length, 3);
    assert.deepEqual(bySku.MSD87018, {
      name: "PILSNER LAGER 3.4% 50L",
      pack: "KEG11G",
      price: 83,
    });
    assert.equal(bySku.MLM14004.name, "MARLISH PREMIUM LEMONADE 200ML NRB");
    assert.equal(bySku.SPL47683.pack, "BOTTLE");
    assert.equal(bySku.SPL47683.price, 6.59);
  });
});

describe("cleanLwcName", () => {
  it("strips house/competitor flags", () => {
    assert.equal(cleanLwcName("[H] RUBICON GUAVA 1L TET"), "RUBICON GUAVA 1L TET");
  });
});

describe("diffLwcPriceLists", () => {
  it("reports added, removed, and price changes", () => {
    const diff = diffLwcPriceLists(
      {
        AAA1: { name: "OLD", pack: "BOTTLE", price: 10 },
        BBB2: { name: "GONE", pack: "BOTTLE", price: 1 },
      },
      {
        AAA1: { name: "OLD", pack: "BOTTLE", price: 11 },
        CCC3: { name: "NEW", pack: "CASE12", price: 2 },
      },
    );
    assert.deepEqual(
      diff.added.map((row) => row.sku),
      ["CCC3"],
    );
    assert.deepEqual(
      diff.removed.map((row) => row.sku),
      ["BBB2"],
    );
    assert.equal(diff.changed[0].sku, "AAA1");
    assert.equal(diff.changed[0].after.price, 11);
  });
});
