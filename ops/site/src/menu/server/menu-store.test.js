import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { planIngredientSync } from "./menu-store.js";

describe("planIngredientSync", () => {
  it("keeps unchanged lines, updates qty, creates and deletes the rest", () => {
    const existing = [
      { id: 1, name: "Gin", quantity: 25, unit: "ml", note: "", abv: "", order: 1, inventoryId: 9, itemId: 3 },
      { id: 2, name: "Lemon", quantity: 15, unit: "ml", note: "", abv: "", order: 2, inventoryId: null, itemId: 3 },
    ];
    const { ops, deletes } = planIngredientSync(
      existing,
      [
        { id: 1, name: "Gin", quantity: 30, unit: "ml", inventoryId: "9" },
        { name: "Vermouth", quantity: 25, unit: "ml", inventoryId: "4" },
      ],
    );
    assert.deepEqual(
      ops.map((op) => op.action),
      ["update", "create"],
    );
    assert.equal(ops[0].row.id, 1);
    assert.equal(deletes.length, 1);
    assert.equal(deletes[0].id, 2);
  });

  it("matches lines without ids by name and inventory", () => {
    const existing = [
      { id: 8, name: "Campari", quantity: 25, unit: "ml", note: "", abv: "", order: 1, inventoryId: 12, itemId: 3 },
    ];
    const { ops, deletes } = planIngredientSync(existing, [
      { name: "Campari", quantity: 25, unit: "ml", inventoryId: "12" },
    ]);
    assert.equal(ops[0].action, "keep");
    assert.equal(ops[0].row.id, 8);
    assert.equal(deletes.length, 0);
  });
});
