import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertItemKey,
  assertUniqueItemName,
  findNameClash,
  itemMatchesKey,
  itemSlug,
  namesClash,
} from "./item-key.js";

describe("itemSlug", () => {
  it("turns drink names into stable URL keys", () => {
    assert.equal(itemSlug("Espresso Martini"), "espresso-martini");
    assert.equal(itemSlug("L'Espresso"), "lespresso");
    assert.equal(itemSlug("Aperol & soda"), "aperol-and-soda");
    assert.equal(itemSlug("Gin / Tonic"), "gin-tonic");
    assert.equal(itemSlug("  Negroni  "), "negroni");
  });
});

describe("assertItemKey", () => {
  it("rejects blank or reserved names", () => {
    assert.throws(() => assertItemKey("  "), { status: 400 });
    assert.throws(() => assertItemKey("new"), { status: 400 });
    assert.throws(() => assertItemKey("!!!"), { status: 400 });
  });
});

describe("unique names", () => {
  it("treats case and slug collisions as the same key", () => {
    assert.equal(namesClash("Negroni", "negroni"), true);
    assert.equal(namesClash("Gin Fizz", "gin-fizz"), true);
    assert.equal(namesClash("Negroni", "Martini"), false);
  });

  it("finds a clash excluding the current row", () => {
    const rows = [
      { id: "1", name: "Negroni" },
      { id: "2", name: "Martini" },
    ];
    assert.equal(findNameClash(rows, "negroni")?.id, "1");
    assert.equal(findNameClash(rows, "Negroni", { exceptId: "1" }), null);
    assert.throws(
      () => assertUniqueItemName(rows, "Martini", { kind: "drink" }),
      { status: 409, message: "A drink with that name already exists." },
    );
  });

  it("matches a route key by slug or leftover numeric id", () => {
    const item = { _id: "88", name: "Espresso Martini" };
    assert.equal(itemMatchesKey(item, "espresso-martini"), true);
    assert.equal(itemMatchesKey(item, "Espresso Martini"), true);
    assert.equal(itemMatchesKey(item, "88"), true);
    assert.equal(itemMatchesKey(item, "negroni"), false);
  });
});
