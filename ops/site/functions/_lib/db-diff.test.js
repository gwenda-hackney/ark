import test from "node:test";
import assert from "node:assert/strict";
import { compareRows, databasePairs, normalizeCell } from "./db-diff.js";

test("links and selects compare by what they show, not row ids", () => {
  assert.deepEqual(normalizeCell([{ id: 9, value: "Gin" }, { id: 2, value: "Amaro" }]), [
    "Amaro",
    "Gin",
  ]);
  assert.equal(normalizeCell({ id: 3, value: "Cocktail", color: "blue" }), "Cocktail");
  assert.equal(normalizeCell(undefined), null);
  assert.equal(normalizeCell(""), null);
  assert.equal(normalizeCell([]), null);
  assert.equal(normalizeCell("2.00"), normalizeCell(2));
});

test("same values with different row ids are in sync", () => {
  const prod = [{ id: 1, order: "1", Name: "Negroni", Section: [{ id: 5, value: "Classics" }] }];
  const copy = [{ id: 77, order: "3", Name: "Negroni", Section: [{ id: 91, value: "Classics" }] }];
  assert.deepEqual(compareRows(prod, copy), {
    sourceOnly: 0,
    targetOnly: 0,
    missingColumns: [],
    extraColumns: [],
  });
});

test("counts rows on one side only, duplicates included, and column drift", () => {
  const prod = [
    { id: 1, Name: "A", Price: 9 },
    { id: 2, Name: "A", Price: 9 },
    { id: 3, Name: "B", Price: 10 },
  ];
  const copy = [
    { id: 1, Name: "A", Price: 9, Legacy: "x" },
    { id: 2, Name: "C", Price: 4, Legacy: "y" },
  ];
  assert.deepEqual(compareRows(prod, copy), {
    sourceOnly: 2,
    targetOnly: 1,
    missingColumns: [],
    extraColumns: ["Legacy"],
  });
});

test("pairs read tokens from env and default to the known databases", () => {
  const pairs = databasePairs({ BASEROW_API_KEY: "prod", BASEROW_OPS_DEV_API_KEY: "dev" });
  assert.equal(pairs.ops.source.databaseId, "556507");
  assert.equal(pairs.ops.target.token, "dev");
  assert.equal(pairs.website.target.databaseId, "564496");
  assert.deepEqual(pairs.ops.ignoreTables, ["App Config"]);
});
