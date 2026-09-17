import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatGbp,
  formatSupplierEntries,
  looksLikeOnlyUrls,
  normalizeSupplierEntries,
  parseMoney,
  parseSupplierEntries,
  skuFromProductUrl,
  supplierFromUrl,
} from "./suppliers.js";

describe("supplierFromUrl", () => {
  it("maps Hills Prospect product pages", () => {
    const hit = supplierFromUrl(
      "https://www.hillsprospect.com/displayitemdetails/P/SPA47010/campari-bitter",
    );
    assert.equal(hit.name, "Hills Prospect");
    assert.equal(hit.website, "https://www.hillsprospect.com");
    assert.match(hit.productUrl, /campari-bitter$/);
  });

  it("falls back to hostname for unknown shops", () => {
    const hit = supplierFromUrl("https://shop.example.com/p/gin");
    assert.equal(hit.name, "shop.example.com");
  });
});

describe("parseSupplierEntries", () => {
  it("reads name, url, and inferred host lines", () => {
    const rows = parseSupplierEntries(
      [
        "Hills Prospect | https://www.hillsprospect.com/p/gin",
        "https://www.lwc-drinks.co.uk/products/vodka",
        "Alivini",
      ].join("\n"),
    );
    assert.equal(rows.length, 3);
    assert.deepEqual(rows[0], {
      name: "Hills Prospect",
      productUrl: "https://www.hillsprospect.com/p/gin",
    });
    assert.equal(rows[1].name, "LWC Drinks");
    assert.equal(rows[2].name, "Alivini");
    assert.equal(rows[2].productUrl, undefined);
  });
});

describe("normalizeSupplierEntries", () => {
  it("accepts mixed objects and raw URLs", () => {
    const rows = normalizeSupplierEntries([
      { name: "Hills Prospect", productUrl: "https://www.hillsprospect.com/p/gin" },
      "https://www.alivini.com/item/1",
    ]);
    assert.equal(rows[0].name, "Hills Prospect");
    assert.equal(rows[1].name, "Alivini");
  });

  it("dedupes the same SKU under one supplier", () => {
    const rows = normalizeSupplierEntries([
      {
        name: "LWC Drinks",
        productUrl:
          "https://www.hillsprospect.com/displayitemdetails/P/SPL47686/buen-amigo-silver-tequila",
        sku: "SPL47686",
        price: 15.97,
      },
      {
        name: "LWC Drinks",
        productUrl:
          "https://www.hillsprospect.com/displayitemdetails/P/SPL47686/tequila-buen-amigo-silver",
        sku: "SPL47686",
        price: 15.97,
      },
    ]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].sku, "SPL47686");
  });
});

describe("formatSupplierEntries", () => {
  it("round-trips name and url", () => {
    const text = formatSupplierEntries([
      { name: "Hills Prospect", productUrl: "https://www.hillsprospect.com/p/gin" },
      { name: "Alivini" },
    ]);
    assert.equal(
      text,
      "Hills Prospect | https://www.hillsprospect.com/p/gin\nAlivini",
    );
  });
});

describe("looksLikeOnlyUrls", () => {
  it("treats blank and URL lists as URL-only", () => {
    assert.equal(looksLikeOnlyUrls(""), true);
    assert.equal(looksLikeOnlyUrls("https://a.test/x\nhttps://b.test/y"), true);
    assert.equal(looksLikeOnlyUrls("call the sales desk"), false);
  });
});

describe("skuFromProductUrl", () => {
  it("reads the Hills / LWC product code", () => {
    assert.equal(
      skuFromProductUrl(
        "https://www.hillsprospect.com/displayitemdetails/P/SPA47010/campari-bitter",
      ),
      "SPA47010",
    );
  });
});

describe("parseMoney / formatGbp", () => {
  it("rounds to pence", () => {
    assert.equal(parseMoney("£15.10"), 15.1);
    assert.equal(formatGbp(15.1), "£15.10");
    assert.equal(formatGbp(""), "");
  });
});
