import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  formatPriceSummary,
  mergeLegacyPrices,
  mirrorPrices,
  newPriceRow,
  nextPriceName,
  normalizePrices,
  parsePriceRows,
  parseSizeMl,
  pricesFromLegacy,
  relabelPrices,
  serializePrices,
  withPrices,
} from "./prices.js";

describe("pricesFromLegacy", () => {
  it("names and sizes the two slots for the drink type", () => {
    assert.deepEqual(
      pricesFromLegacy({ drinkType: "pour", price: "8", priceAlt: "10", lightspeedSku: "G1", lightspeedSkuAlt: "G2" }),
      [
        { name: "Single", size: "25 ml", price: "8", sku: "G1" },
        { name: "Double", size: "50 ml", price: "10", sku: "G2" },
      ],
    );
    assert.deepEqual(pricesFromLegacy({ drinkType: "beer", price: "6.5", priceAlt: "3.5" }), [
      { name: "Pint", size: "Pint", price: "6.5" },
      { name: "Half pint", size: "Half pint", price: "3.5" },
    ]);
    assert.deepEqual(pricesFromLegacy({ drinkType: "cocktail", price: "12" }), [{ name: "Single", price: "12" }]);
  });

  it("always gives the main row, blank on a new drink", () => {
    assert.deepEqual(pricesFromLegacy({ drinkType: "packaged" }), [{ name: "Price", price: "" }]);
    assert.deepEqual(pricesFromLegacy(null), [{ name: "Single", price: "" }]);
  });

  it("keeps a second price on a packaged drink, which has no second name", () => {
    assert.equal(pricesFromLegacy({ drinkType: "packaged", price: "5", priceAlt: "9" })[1].name, "Price 2");
  });
});

describe("normalizePrices", () => {
  it("uses the drink's own rows when it has them", () => {
    const prices = [
      { name: "125 ml", size: "125 ml", price: "7" },
      { name: "175 ml", size: "175 ml", price: "9" },
      { name: "Bottle", price: "£34" },
    ];
    assert.deepEqual(normalizePrices({ price: "1", prices }), [
      prices[0],
      prices[1],
      { name: "Bottle", price: "34" },
    ]);
  });

  it("falls back to the old slots when there are none", () => {
    assert.deepEqual(normalizePrices({ drinkType: "pour", price: "8", prices: [] }), [
      { name: "Single", size: "25 ml", price: "8" },
    ]);
    assert.deepEqual(normalizePrices({ drinkType: "pour", price: "8", prices: "" }), [
      { name: "Single", size: "25 ml", price: "8" },
    ]);
  });

  it("keeps a row being typed into in its place", () => {
    const rows = normalizePrices({
      prices: [
        { name: "Single", price: "8" },
        { name: "", price: "" },
      ],
    });
    assert.equal(rows.length, 2);
  });
});

describe("parsePriceRows", () => {
  it("reads the column's JSON and ignores what it can't read", () => {
    assert.deepEqual(parsePriceRows('[{"name":"Pint","price":"6"}]'), [{ name: "Pint", price: "6" }]);
    assert.deepEqual(parsePriceRows("not json"), []);
    assert.deepEqual(parsePriceRows('{"name":"x"}'), []);
    assert.deepEqual(parsePriceRows([null, { name: "", price: "" }, { name: "A", price: 4 }]), [{ name: "A", price: "4" }]);
  });
});

describe("mergeLegacyPrices", () => {
  it("reads the old slots when the Prices column is empty or missing", () => {
    assert.deepEqual(mergeLegacyPrices({ drinkType: "beer", price: "6", priceAlt: "3.5" }), [
      { name: "Pint", size: "Pint", price: "6" },
      { name: "Half pint", size: "Half pint", price: "3.5" },
    ]);
  });

  it("lays the slots over the first two rows, keeping the rest", () => {
    const prices = JSON.stringify([
      { name: "125 ml", price: "7" },
      { name: "175 ml", price: "9", sku: "OLD" },
      { name: "Bottle", price: "34", sku: "G9" },
    ]);
    assert.deepEqual(
      mergeLegacyPrices({ prices, price: "7.5", priceAlt: "9", lightspeedSku: "G1", lightspeedSkuAlt: "G2" }),
      [
        { name: "125 ml", price: "7.5", sku: "G1" },
        { name: "175 ml", price: "9", sku: "G2" },
        { name: "Bottle", price: "34", sku: "G9" },
      ],
    );
  });

  it("adds a second row for a second-size price set without one", () => {
    const rows = mergeLegacyPrices({ drinkType: "pour", prices: [{ name: "Single", price: "8" }], priceAlt: "10" });
    assert.deepEqual(rows[1], { name: "Double", size: "50 ml", price: "10" });
  });

  it("leaves a row alone where the slot is blank", () => {
    const rows = mergeLegacyPrices({ prices: [{ name: "Glass", price: "8" }, { name: "Bottle", price: "30" }], price: "" });
    assert.deepEqual(rows, [{ name: "Glass", price: "8" }, { name: "Bottle", price: "30" }]);
  });
});

describe("mirrorPrices", () => {
  it("fills the old slots from the first two rows", () => {
    const rows = [
      { name: "Single", price: "8", sku: "G1" },
      { name: "Double", price: "10" },
      { name: "Triple", price: "14", sku: "G3" },
    ];
    assert.deepEqual(mirrorPrices(rows), { price: "8", priceAlt: "10", lightspeedSku: "G1", lightspeedSkuAlt: "" });
    assert.deepEqual(mirrorPrices([{ name: "Price", price: "5" }]), {
      price: "5",
      priceAlt: "",
      lightspeedSku: "",
      lightspeedSkuAlt: "",
    });
  });

  it("keeps the item's slots in step with its rows", () => {
    const item = withPrices({ name: "Gin", priceAlt: "10" }, [{ name: "Single", price: "8" }]);
    assert.equal(item.price, "8");
    assert.equal(item.priceAlt, "");
    assert.equal(item.prices.length, 1);
  });
});

describe("serializePrices", () => {
  it("stores tidy rows without blank sizes, SKUs or empty rows", () => {
    assert.equal(
      serializePrices([
        { name: " Single ", size: "", price: "8", sku: "" },
        { name: "", price: "" },
      ]),
      '[{"name":"Single","price":"8"}]',
    );
  });
});

describe("nextPriceName", () => {
  it("offers the usual second size, then numbers", () => {
    assert.equal(nextPriceName([{ name: "Single", price: "8" }], "cocktail"), "Double");
    assert.equal(nextPriceName([{ name: "Pint", price: "6" }], "beer"), "Half pint");
    assert.equal(nextPriceName([{ name: "Pint", price: "6" }], "cocktail"), "Half pint");
    assert.equal(
      nextPriceName(
        [
          { name: "Single", price: "8" },
          { name: "Double", price: "10" },
        ],
        "pour",
      ),
      "Price 3",
    );
    assert.equal(nextPriceName([{ name: "Glass", price: "8" }, { name: "Price 3", price: "9" }], "pour"), "Price 4");
  });
});

describe("newPriceRow", () => {
  it("sizes the usual second serve and leaves the price blank", () => {
    assert.deepEqual(newPriceRow([{ name: "Single", size: "25 ml", price: "8" }], "pour"), {
      name: "Double",
      size: "50 ml",
      price: "",
    });
    assert.deepEqual(newPriceRow([{ name: "Single", price: "12" }], "cocktail"), { name: "Double", price: "" });
    assert.deepEqual(newPriceRow([{ name: "Price", price: "5" }], "packaged"), { name: "Price 2", price: "" });
  });
});

describe("relabelPrices", () => {
  it("renames default rows for the new drink type and keeps typed ones", () => {
    const rows = relabelPrices(
      [
        { name: "Single", size: "25 ml", price: "8" },
        { name: "Large", size: "50 ml", price: "10" },
      ],
      "pour",
      "beer",
    );
    assert.deepEqual(rows, [
      { name: "Pint", size: "Pint", price: "8" },
      { name: "Large", size: "Half pint", price: "10" },
    ]);
    assert.deepEqual(relabelPrices([{ name: "Single", size: "25 ml", price: "8" }], "pour", "cocktail"), [
      { name: "Single", price: "8" },
    ]);
  });
});

describe("parseSizeMl", () => {
  it("reads millilitres from a size with its unit", () => {
    assert.equal(parseSizeMl("25 ml"), 25);
    assert.equal(parseSizeMl("175ml"), 175);
    assert.equal(parseSizeMl("2.5 cl"), 25);
    assert.equal(parseSizeMl("1 L"), 1000);
    assert.equal(parseSizeMl("Pint"), 568);
    assert.equal(parseSizeMl("half pint"), 284);
  });

  it("says nothing for sizes without a measure", () => {
    assert.equal(parseSizeMl("Bottle"), null);
    assert.equal(parseSizeMl("25"), null);
    assert.equal(parseSizeMl(""), null);
    assert.equal(parseSizeMl(undefined), null);
  });
});

describe("formatPriceSummary", () => {
  it("shows one price bare and several with their names", () => {
    assert.equal(formatPriceSummary([{ name: "Single", price: "12" }]), "£12");
    assert.equal(
      formatPriceSummary([
        { name: "Single", price: "8" },
        { name: "Double", price: "10" },
      ]),
      "£8 single · £10 double",
    );
    assert.equal(formatPriceSummary([{ name: "Single", price: "" }]), "");
  });
});
