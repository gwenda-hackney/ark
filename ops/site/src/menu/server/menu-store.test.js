import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { planIngredientSync } from "./menu-store.js";

describe("planIngredientSync", () => {
  it("keeps unchanged lines, updates qty, creates and deletes the rest", () => {
    const existing = [
      {
        id: 1,
        Name: "Gin",
        Qty: 25,
        Unit: { value: "ml" },
        Note: "",
        ABV: "",
        Order: 1,
        Inventory: [{ id: 9 }],
        "Menu Item": [{ id: 3 }],
      },
      {
        id: 2,
        Name: "Lemon",
        Qty: 15,
        Unit: { value: "ml" },
        Note: "",
        ABV: "",
        Order: 2,
        Inventory: [],
        "Menu Item": [{ id: 3 }],
      },
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
      {
        id: 8,
        Name: "Campari",
        Qty: 25,
        Unit: { value: "ml" },
        Note: "",
        ABV: "",
        Order: 1,
        Inventory: [{ id: 12 }],
        "Menu Item": [{ id: 3 }],
      },
    ];
    const { ops, deletes } = planIngredientSync(existing, [
      { name: "Campari", quantity: 25, unit: "ml", inventoryId: "12" },
    ]);
    assert.equal(ops[0].action, "keep");
    assert.equal(ops[0].row.id, 8);
    assert.equal(deletes.length, 0);
  });
});
