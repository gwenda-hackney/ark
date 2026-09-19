import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import {
  assignedLightspeedSku,
  canCreateFromLightspeed,
  lightspeedItemImportCsv,
  matchLightspeedRows,
  parseLightspeedCsv,
  patchesFromMatch,
  summarizeMatch,
} from "./lightspeed-stock.js";

const fixtures = dirname(fileURLToPath(import.meta.url));
const itemCsv = readFileSync(
  join(fixtures, "fixtures/lightspeed-items.csv"),
  "utf8",
);
const stockCsv = readFileSync(
  join(fixtures, "fixtures/lightspeed-stock-levels.csv"),
  "utf8",
);

const opsItems = [
  {
    _id: "1",
    id: "1",
    name: "Campari",
    kind: "liqueur",
    lightspeedSku: "CAMPARI",
    defaultUnit: "ml",
  },
  {
    _id: "2",
    id: "2",
    name: "Bombay",
    fullName: "Bombay Sapphire",
    kind: "liquor",
    defaultUnit: "ml",
  },
  {
    _id: "3",
    id: "3",
    name: "St-Germain",
    kind: "liqueur",
    defaultUnit: "ml",
    suppliers: [{ name: "LWC", price: 21.5 }],
  },
  {
    _id: "4",
    id: "4",
    name: "House gin",
    kind: "liquor",
    lightspeedSku: "HOUSEGIN",
    defaultUnit: "ml",
  },
];

describe("parseLightspeedCsv", () => {
  it("reads a K-Series item export", () => {
    const rows = parseLightspeedCsv(itemCsv);
    assert.equal(rows.length, 4);
    assert.deepEqual(
      rows.find((row) => row.sku === "CAMPARI"),
      {
        sku: "CAMPARI",
        name: "Campari",
        quantity: null,
        unit: "ml",
        type: "Item",
        accountingGroup: "Spirits",
        costPrice: 18.5,
        packageContent: "700",
        key: "sku:CAMPARI",
      },
    );
    assert.equal(rows.find((row) => row.sku === "NEGRONI")?.type, "Combo");
  });

  it("reads a stock-levels export with counted quantity", () => {
    const rows = parseLightspeedCsv(stockCsv);
    assert.equal(rows.find((row) => row.sku === "CAMPARI")?.quantity, 6);
    assert.equal(rows.find((row) => row.name === "Lemon juice")?.quantity, 2.5);
    assert.equal(rows.find((row) => row.sku === "HOUSEGIN")?.quantity, 0);
    assert.equal(rows.find((row) => row.sku === "AMARO99")?.name, "Unknown amaro");
  });

  it("accepts BOM, aliases, and quoted commas", () => {
    const rows = parseLightspeedCsv(
      "\uFEFFsku,Product,Total quantity,uom\n" +
        '"A1","Vecchio Amaro, del Capo",3,"bottle"\n',
    );
    assert.equal(rows[0].sku, "A1");
    assert.equal(rows[0].name, "Vecchio Amaro, del Capo");
    assert.equal(rows[0].quantity, 3);
    assert.equal(rows[0].unit, "bottle");
  });

  it("rejects a file with no SKU or name column", () => {
    assert.throws(
      () => parseLightspeedCsv("Price,Qty\n1,2\n"),
      /SKU or Name/,
    );
  });
});

describe("matchLightspeedRows", () => {
  it("matches SKU first, then name, and reports both unmatched sides", () => {
    const result = matchLightspeedRows(opsItems, parseLightspeedCsv(itemCsv));
    assert.equal(
      result.matched.find((row) => row.via === "sku")?.ops.name,
      "Campari",
    );
    assert.equal(
      result.matched.find((row) => row.via === "name")?.ops.name,
      "Bombay",
    );
    assert.equal(result.opsOnly.map((row) => row.name).join(","), "St-Germain");
    assert.ok(result.lightspeedOnly.some((row) => row.sku === "NEGRONI"));
    assert.equal(result.conflicts.length, 1);
    assert.equal(result.conflicts[0].ops.name, "House gin");
    assert.equal(result.conflicts[0].lightspeed.name, "Tanqueray");
  });

  it("falls back to name when the stock file has no SKU", () => {
    const stockOps = [
      { _id: "8", id: "8", name: "Lemon juice", kind: "juice" },
      ...opsItems,
    ];
    const result = matchLightspeedRows(stockOps, parseLightspeedCsv(stockCsv));
    const lemon = result.matched.find((row) => row.ops.name === "Lemon juice");
    assert.equal(lemon?.via, "name");
    assert.equal(lemon?.lightspeed.quantity, 2.5);
    assert.ok(result.lightspeedOnly.some((row) => row.sku === "AMARO99"));
  });
});

describe("patchesFromMatch", () => {
  it("writes SKU and counted qty from matched and conflict rows", () => {
    const result = matchLightspeedRows(opsItems, parseLightspeedCsv(stockCsv));
    const patches = patchesFromMatch(result);
    const campari = patches.find((row) => row.id === "1");
    assert.equal(campari.lightspeedSku, "CAMPARI");
    assert.equal(campari.actualQty, 6);
    assert.equal(campari.actualUnit, "");
  });
});

describe("lightspeed item import", () => {
  it("emits a K-Series item CSV for ops-only catalog rows", () => {
    const csv = lightspeedItemImportCsv([
      opsItems[2],
      { ...opsItems[2], _id: "9", name: "Inactive syrup", active: false },
    ]);
    assert.match(csv, /^SKU,Accounting group,Type,Name,Cost price,Package unit\n/);
    assert.match(csv, /STGERMAIN/);
    assert.match(csv, /Item,St-Germain,21.5,ml/);
    assert.doesNotMatch(csv, /Inactive syrup/);
  });

  it("reuses a stored Lightspeed SKU", () => {
    assert.equal(assignedLightspeedSku({ lightspeedSku: "CAMPARI" }), "CAMPARI");
  });

  it("only offers Create in ops for Item rows", () => {
    assert.equal(canCreateFromLightspeed({ type: "Item" }), true);
    assert.equal(canCreateFromLightspeed({ type: "Combo" }), false);
    assert.equal(canCreateFromLightspeed({ type: "" }), true);
    const preview = summarizeMatch(
      matchLightspeedRows(opsItems, parseLightspeedCsv(itemCsv)),
    );
    const combo = preview.lightspeedOnly.find((row) => row.sku === "NEGRONI");
    assert.equal(combo?.canCreate, false);
  });
});
