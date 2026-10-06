import assert from "node:assert/strict";
import { beforeEach, describe, it } from "vitest";
import { createTestD1 } from "../../../../../shared/testing/d1-sqlite.js";
import { d1MenuRepository } from "../../menu/server/adapters/d1-menu.js";
import { memoryMenuRepository } from "../../menu/server/adapters/memory-menu.js";
import {
  applyLightspeedActual,
  createInventoryFromLightspeed,
  createInventoryItem,
  createSupplier,
  deleteInventoryItem,
  deleteSupplier,
  listInventory,
  listSuppliers,
  mapInventoryItem,
  parseQty,
  updateInventoryItem,
  updateSupplier,
} from "./inventory-store.js";

describe("parseQty", () => {
  it("parses numbers and blanks", () => {
    assert.equal(parseQty(6), 6);
    assert.equal(parseQty("6.250"), 6.25);
    assert.equal(parseQty(""), null);
    assert.equal(parseQty(undefined), null);
  });
});

describe("mapInventoryItem", () => {
  it("maps on-hand qty, unit, and counted at", () => {
    const item = mapInventoryItem({
      id: 12,
      name: "Campari",
      kind: "liqueur",
      actualQty: 6,
      actualUnit: "btl",
      countedAt: "2026-09-19T08:00:00.000Z",
    });
    assert.equal(item.actualQty, 6);
    assert.equal(item.actualUnit, "btl");
    assert.equal(item.countedAt, "2026-09-19T08:00:00.000Z");
  });

  it("omits on-hand qty when the count is empty", () => {
    const item = mapInventoryItem({
      id: 13,
      name: "Lemon",
      kind: "garnish",
      actualQty: null,
      countedAt: "",
    });
    assert.equal(item.actualQty, undefined);
    assert.equal(item.actualUnit, undefined);
    assert.equal(item.countedAt, undefined);
  });
});

// The store on the repository, with the menu in memory and on D1 (#127).
for (const [store, make] of [
  ["memory", () => memoryMenuRepository()],
  ["d1", () => d1MenuRepository(createTestD1("ops"))],
]) {
  describe(`stock and suppliers (${store})`, () => {
    let env;
    let repo;
    beforeEach(() => {
      repo = make();
      env = { menuRepository: repo };
    });

    it("creates stock with its suppliers, creating a supplier it doesn't know", async () => {
      const gin = await createInventoryItem(env, {
        name: "Gin",
        kind: "liquor",
        abv: "40%",
        actualQty: "2",
        suppliers: [{ name: "LWC Drinks", productUrl: "https://www.lwc-drinks.co.uk/p/SPG1", pack: "6x70cl", price: "19.99" }],
      });
      assert.equal(gin.abv, "40");
      assert.equal(gin.actualQty, 2);
      assert.ok(gin.countedAt, "a count is stamped");
      assert.deepEqual(
        gin.suppliers.map((link) => [link.name, link.pack, link.price]),
        [["LWC Drinks", "6x70cl", 19.99]],
      );
      const [listed] = await listInventory(env);
      assert.deepEqual(listed.suppliers, gin.suppliers.map(({ inventoryId: _id, ...link }) => link));
      assert.deepEqual(
        (await listSuppliers(env)).map((row) => [row.name, row.itemCount]),
        [["LWC Drinks", 1]],
      );
      await assert.rejects(() => createInventoryItem(env, { name: "gin" }), (error) => error.status === 409);
    });

    it("replaces supplier links, keeps the ones that didn't change", async () => {
      const gin = await createInventoryItem(env, {
        name: "Gin",
        suppliers: [{ name: "LWC Drinks", sku: "SPG1" }, { name: "Hills", sku: "H1" }],
      });
      const kept = gin.suppliers.find((link) => link.name === "LWC Drinks");
      const next = await updateInventoryItem(env, gin.id, {
        suppliers: [{ supplierId: kept.supplierId, name: "LWC Drinks", sku: "SPG1", price: 21 }],
      });
      assert.deepEqual(next.suppliers.map((link) => [link._id, link.price]), [[kept._id, 21]]);
      assert.equal((await repo.list("inventory_suppliers")).length, 1);
    });

    it("a new stock ABV moves the cocktails that follow the recipe", async () => {
      const gin = await createInventoryItem(env, { name: "Gin", abv: "40" });
      const section = await repo.create("menu_sections", { name: "Cocktails", slug: "cocktails" });
      const drink = await repo.create("menu_items", { name: "G&T", drinkType: "cocktail", sectionId: section.id, abv: "20%", volume: "100 ml" });
      await repo.create("ingredients", { name: "Gin", itemId: drink.id, inventoryId: Number(gin.id), quantity: 50, unit: "ml", order: 1 });
      await repo.create("ingredients", { name: "Tonic", itemId: drink.id, quantity: 50, unit: "ml", order: 2 });
      await updateInventoryItem(env, gin.id, { abv: "50" });
      assert.equal((await repo.get("menu_items", drink.id)).abv, "25%");
    });

    it("deleting stock takes its supplier links; a supplier in use can't go", async () => {
      const gin = await createInventoryItem(env, { name: "Gin", suppliers: [{ name: "LWC Drinks" }] });
      const [lwc] = await listSuppliers(env);
      await assert.rejects(() => deleteSupplier(env, lwc.id), (error) => error.status === 409);
      await deleteInventoryItem(env, gin.id);
      assert.deepEqual(await repo.list("inventory_suppliers"), []);
      await deleteSupplier(env, lwc.id);
      assert.deepEqual(await listSuppliers(env), []);
    });

    it("suppliers: create, rename, refuse a clash", async () => {
      const lwc = await createSupplier(env, { name: "LWC Drinks", website: "lwc-drinks.co.uk" });
      await createSupplier(env, { name: "Hills" });
      await assert.rejects(() => createSupplier(env, { name: "lwc drinks" }), (error) => error.status === 409);
      await assert.rejects(() => updateSupplier(env, lwc.id, { name: "Hills" }), (error) => error.status === 409);
      const renamed = await updateSupplier(env, lwc.id, { name: "LWC" });
      assert.equal(renamed.name, "LWC");
      assert.equal(renamed.itemCount, 0);
      await assert.rejects(() => updateSupplier(env, "987654", { name: "X" }), (error) => error.status === 404);
    });

    it("Lightspeed counts and new stock from the till", async () => {
      const gin = await createInventoryItem(env, { name: "Gin" });
      const [counted] = await applyLightspeedActual(env, [{ id: gin.id, lightspeedSku: "G1", actualQty: 3, actualUnit: "btl" }], "2026-10-06T08:00:00.000Z");
      assert.deepEqual([counted.lightspeedSku, counted.actualQty, counted.countedAt], ["G1", 3, "2026-10-06T08:00:00.000Z"]);
      const created = await createInventoryFromLightspeed(env, { name: "Gin", sku: "G2", quantity: 1, unit: "ml" });
      assert.equal(created.name, "Gin (G2)");
      assert.equal(created.defaultUnit, "ml");
    });
  });
}
