/**
 * What every MenuRepository adapter must do (#186, #127): the same cases run
 * on memory, Baserow (the fake world) and D1 (SQLite with the real
 * migrations), plus the copy between them that data-move relies on.
 */
import assert from "node:assert/strict";
import { afterEach, describe, it } from "vitest";
import { createTestD1 } from "../../../../../shared/testing/d1-sqlite.js";
import { repositoryContract } from "../../../../../shared/testing/repository-contract.js";
import { createFakeWorld } from "../../testing/fake-world.js";
import { baserowMenuRepository } from "./adapters/baserow-menu.js";
import { d1MenuRepository } from "./adapters/d1-menu.js";
import { memoryMenuRepository } from "./adapters/memory-menu.js";
import { MENU_COLLECTION_NAMES, menuRecord } from "./menu-model.js";
import { menuRepository } from "./menu-repository.js";

const ASSET = "image-0a1b2c3d4e5f60718293a4b5c6d7e8f901234567-800x600-jpg";

const worlds = [];
afterEach(() => {
  while (worlds.length) worlds.pop().restore();
});

async function fakeWorld() {
  const world = await createFakeWorld();
  world.install();
  worlds.push(world);
  return world;
}

const ADAPTERS = {
  memory: () => memoryMenuRepository(),
  baserow: async () => baserowMenuRepository((await fakeWorld()).env),
  d1: () => d1MenuRepository(createTestD1("ops")),
};

const missingId = 987_654;

/** One of everything, linked the way ops links them. */
async function seedMenu(repo) {
  const chapter = await repo.create("menu_sections", {
    name: "Our Formulas",
    slug: "our-formulas",
    order: 1,
  });
  const group = await repo.create("menu_sections", {
    name: "Spritz",
    slug: "spritz",
    subtitle: "Bubbles",
    parentId: chapter.id,
    order: 2,
    sanityId: "section-spritz",
  });
  const fall = await repo.create("pos_menus", {
    name: "Fall 2026",
    order: 1,
    isDefault: true,
  });
  const live = await repo.create("pos_menus", { name: "Live", order: 2 });
  const gin = await repo.create("inventory", {
    name: "Gin",
    fullName: "Arboretum Gin",
    kind: "liquor",
    abv: "40",
    defaultUnit: "ml",
    estimatedCost: 21.5,
    lightspeedSku: "G1",
    actualQty: 2.5,
    actualUnit: "btl",
    countedAt: "2026-09-19T08:00:00Z",
  });
  const lwc = await repo.create("suppliers", {
    name: "LWC Drinks",
    website: "https://www.lwc-drinks.co.uk",
  });
  await repo.create("inventory_suppliers", {
    name: "LWC Drinks",
    inventoryId: gin.id,
    supplierId: lwc.id,
    productUrl: "https://www.lwc-drinks.co.uk/p/SPG1",
    sku: "SPG1",
    pack: "6x70cl",
    price: 19.99,
  });
  const drink = await repo.create("menu_items", {
    name: "Gwenda Spritz",
    sectionId: group.id,
    menuLine: "Gin, bitter orange, soda",
    price: "11",
    altPrice: "",
    prices: [{ name: "Single", price: "11" }],
    drinkType: "cocktail",
    cocktailType: "spritz",
    method: "Build over ice.",
    abv: "12%",
    volume: "150 ml",
    abvOverride: true,
    photoAsset: ASSET,
    order: 3,
    sanityId: "item-spritz",
    onDigitalMenu: true,
    onPrintMenu: false,
    publishSnapshots: {
      preview: {
        at: "2026-10-01T10:00:00Z",
        hash: "h",
        payload: { name: "Gwenda Spritz" },
      },
    },
    analysisNote: '{"summary":"Bright"}',
    lightspeedSku: "S1",
    lightspeedStatus: "matched",
    posMenuIds: [live.id, fall.id],
  });
  await repo.create("ingredients", {
    name: "Gin",
    itemId: drink.id,
    inventoryId: gin.id,
    quantity: 37.5,
    unit: "ml",
    order: 1,
  });
  await repo.create("ingredients", {
    name: "Soda",
    itemId: drink.id,
    quantity: 100,
    unit: "ml",
    note: "top",
    order: 2,
  });
  await repo.create("menu_placements", {
    itemId: drink.id,
    channel: "digital",
    sectionId: group.id,
    order: 1,
  });
  await repo.create("menu_placements", {
    itemId: drink.id,
    channel: "pos",
    posMenuId: fall.id,
    posScreen: "Spritz",
  });
  return { chapter, group, fall, live, gin, lwc, drink };
}

repositoryContract("MenuRepository", {
  adapters: ADAPTERS,
  seed: async (repo) => {
    await seedMenu(repo);
  },
  cases: {
    "every field of every collection round-trips": async (repo) => {
      const { drink, gin, group, live, fall } = await seedMenu(repo);
      assert.equal(typeof drink.id, "number");
      assert.deepEqual(await repo.get("menu_items", drink.id), drink);
      assert.deepEqual(await repo.get("menu_items", String(drink.id)), drink);
      assert.deepEqual(
        drink.posMenuIds,
        [fall.id, live.id].sort((a, b) => a - b),
        "ids, ascending",
      );
      assert.deepEqual(drink.prices, [{ name: "Single", price: "11" }]);
      assert.equal(drink.publishSnapshots.preview.hash, "h");
      assert.equal(drink.abvOverride, true);
      assert.equal(drink.volumeOverride, false);
      assert.equal(drink.onPrintMenu, false);
      assert.equal(drink.altPrice, "", "text is never null");
      assert.equal(drink.sectionId, group.id);
      assert.deepEqual(await repo.get("inventory", gin.id), gin);
      assert.equal(gin.estimatedCost, 21.5);
      assert.equal(gin.actualQty, 2.5);
      assert.equal(gin.active, true, "stock is active unless switched off");
      const [line] = await repo.list("ingredients", { itemId: drink.id });
      assert.equal(line.quantity, 37.5);
      assert.equal(line.inventoryId, gin.id);
      for (const name of MENU_COLLECTION_NAMES) {
        for (const record of await repo.list(name)) {
          assert.deepEqual(
            await repo.get(name, record.id),
            record,
            `${name} ${record.id}`,
          );
          assert.deepEqual(
            Object.keys(record).sort(),
            Object.keys(menuRecord(name)).sort(),
            `${name} fields`,
          );
        }
      }
    },
    "a new record has every field, empty": async (repo) => {
      const item = await repo.create("menu_items", { name: "Water" });
      assert.deepEqual(
        item,
        menuRecord("menu_items", { id: item.id, name: "Water" }),
      );
      assert.equal(item.onDigitalMenu, true);
      assert.equal(item.onPrintMenu, true);
      assert.deepEqual(item.posMenuIds, []);
      assert.equal(item.prices, null);
      assert.equal(item.sectionId, null);
    },
    "update changes only the given fields": async (repo) => {
      const { drink, fall } = await seedMenu(repo);
      const moved = await repo.update("menu_items", drink.id, {
        price: "12",
        posMenuIds: [fall.id],
        prices: null,
      });
      assert.deepEqual(moved, {
        ...drink,
        price: "12",
        posMenuIds: [fall.id],
        prices: null,
      });
      const off = await repo.update("menu_items", String(drink.id), {
        onDigitalMenu: false,
        sectionId: null,
      });
      assert.deepEqual(off, {
        ...moved,
        onDigitalMenu: false,
        sectionId: null,
      });
      assert.deepEqual(await repo.get("menu_items", drink.id), off);
      const kept = await repo.update("menu_items", drink.id, {
        posMenuIds: undefined,
        name: "Gwenda Spritz",
      });
      assert.deepEqual(kept.posMenuIds, [fall.id], "POS menus left out stay");
    },
    "lists by link": async (repo) => {
      const { drink, gin, lwc } = await seedMenu(repo);
      const other = await repo.create("menu_items", { name: "Negroni" });
      await repo.create("ingredients", {
        name: "Campari",
        itemId: other.id,
        order: 1,
      });
      assert.deepEqual(
        (await repo.list("ingredients", { itemId: drink.id })).map(
          (line) => line.name,
        ),
        ["Gin", "Soda"],
      );
      assert.deepEqual(
        (await repo.list("ingredients", { inventoryId: gin.id })).map(
          (line) => line.name,
        ),
        ["Gin"],
      );
      assert.equal(
        (await repo.list("menu_placements", { itemId: String(drink.id) }))
          .length,
        2,
      );
      assert.equal(
        (await repo.list("inventory_suppliers", { supplierId: lwc.id })).length,
        1,
      );
      assert.deepEqual(
        await repo.list("menu_placements", { itemId: other.id }),
        [],
      );
      const ids = (await repo.list("ingredients")).map((line) => line.id);
      assert.deepEqual(
        ids,
        [...ids].sort((a, b) => a - b),
        "by id",
      );
      await assert.rejects(
        () => repo.list("ingredients", { name: "Gin" }),
        /can't be listed by name/,
      );
    },
    "removing a drink takes its recipe and placements; removing stock or a supplier its supplier links":
      async (repo) => {
        const { drink, gin, lwc, group } = await seedMenu(repo);
        const tonic = await repo.create("inventory", {
          name: "Tonic",
          kind: "mixer",
        });
        const link = await repo.create("inventory_suppliers", {
          name: "LWC Drinks",
          inventoryId: tonic.id,
          supplierId: lwc.id,
        });
        await repo.remove("inventory", gin.id);
        const [line] = await repo.list("ingredients", { itemId: drink.id });
        assert.equal(
          line.inventoryId,
          null,
          "a recipe line keeps its name when its stock goes",
        );
        assert.deepEqual(
          (await repo.list("inventory_suppliers")).map((row) => row.id),
          [link.id],
        );
        await repo.remove("suppliers", lwc.id);
        assert.deepEqual(await repo.list("inventory_suppliers"), []);
        await repo.remove("menu_sections", group.id);
        assert.equal((await repo.get("menu_items", drink.id)).sectionId, null);
        await repo.remove("menu_items", drink.id);
        assert.equal(await repo.get("menu_items", drink.id), null);
        assert.deepEqual(await repo.list("ingredients"), []);
        assert.deepEqual(await repo.list("menu_placements"), []);
      },
    "removing a POS menu takes it off the drinks": async (repo) => {
      const { drink, fall, live } = await seedMenu(repo);
      await repo.remove("pos_menus", fall.id);
      assert.deepEqual((await repo.get("menu_items", drink.id)).posMenuIds, [
        live.id,
      ]);
      const pos = (
        await repo.list("menu_placements", { itemId: drink.id })
      ).find((row) => row.channel === "pos");
      assert.equal(pos.posMenuId, null);
    },
    "a missing record: get is null, update is a 404, remove is fine": async (
      repo,
    ) => {
      assert.equal(await repo.get("menu_items", missingId), null);
      await assert.rejects(
        () => repo.update("menu_items", missingId, { name: "X" }),
        (error) => error.status === 404,
      );
      await repo.remove("menu_items", missingId);
      await repo.write([
        { op: "remove", collection: "ingredients", id: missingId },
      ]);
    },
    "write applies changes in order and returns each record": async (repo) => {
      const { drink } = await seedMenu(repo);
      const [soda] = (
        await repo.list("ingredients", { itemId: drink.id })
      ).filter((line) => line.name === "Soda");
      const [gin] = (
        await repo.list("ingredients", { itemId: drink.id })
      ).filter((line) => line.name === "Gin");
      const out = await repo.write([
        {
          op: "update",
          collection: "ingredients",
          id: gin.id,
          fields: { quantity: 50 },
        },
        {
          op: "create",
          collection: "ingredients",
          fields: { name: "Lemon", itemId: drink.id, order: 3 },
        },
        {
          op: "create",
          collection: "ingredients",
          fields: { name: "Salt", itemId: drink.id, order: 4 },
        },
        { op: "remove", collection: "ingredients", id: soda.id },
        {
          op: "update",
          collection: "menu_items",
          id: drink.id,
          fields: { abv: "14%" },
        },
      ]);
      assert.equal(out.length, 5);
      assert.deepEqual(out[0], { ...gin, quantity: 50 });
      assert.equal(out[1].name, "Lemon");
      assert.equal(out[2].itemId, drink.id);
      assert.equal(out[3], null);
      assert.deepEqual(out[4], { ...drink, abv: "14%" });
      assert.deepEqual(
        (await repo.list("ingredients", { itemId: drink.id })).map(
          (line) => line.name,
        ),
        ["Gin", "Lemon", "Salt"],
      );
    },
    "write creates a drink with its POS menus": async (repo) => {
      const { fall } = await seedMenu(repo);
      const [created] = await repo.write([
        {
          op: "create",
          collection: "menu_items",
          fields: { name: "Negroni", posMenuIds: [fall.id] },
        },
      ]);
      assert.deepEqual(created.posMenuIds, [fall.id]);
      assert.deepEqual(await repo.get("menu_items", created.id), created);
    },
    "exports every record of every collection": async (repo) => {
      await seedMenu(repo);
      const snapshot = await repo.exportAll();
      assert.deepEqual(Object.keys(snapshot), MENU_COLLECTION_NAMES);
      for (const name of MENU_COLLECTION_NAMES)
        assert.deepEqual(snapshot[name], await repo.list(name), name);
      assert.equal(snapshot.menu_items.length, 1);
      assert.equal(snapshot.ingredients.length, 2);
    },
  },
});

describe("MenuRepository (d1) storage", () => {
  it("a copy keeps ids, and new records don't reuse them", async () => {
    const repo = d1MenuRepository(createTestD1("ops"));
    await repo.importAll({
      // A group before its chapter: the copy puts parents first.
      menu_sections: [
        { id: 9, name: "Spritz", parentId: 40 },
        { id: 40, name: "Our Formulas" },
      ],
      menu_items: [{ id: 300, name: "Spritz", sectionId: 9 }],
    });
    assert.equal((await repo.get("menu_sections", 9)).parentId, 40);
    const next = await repo.create("menu_items", { name: "Negroni" });
    assert.ok(next.id > 300);
  });

  it("puts a save of many recipe lines in batches", async () => {
    const db = createTestD1("ops");
    const batches = [];
    const counting = {
      ...db,
      batch: (statements) => (
        batches.push(statements.length),
        db.batch(statements)
      ),
    };
    const repo = d1MenuRepository(counting);
    const drink = await repo.create("menu_items", { name: "Punch" });
    batches.length = 0;
    await repo.write(
      Array.from({ length: 60 }, (_, index) => ({
        op: "create",
        collection: "ingredients",
        fields: { name: `Line ${index}`, itemId: drink.id, order: index },
      })),
    );
    assert.deepEqual(batches, [50, 10]);
    assert.equal(
      (await repo.list("ingredients", { itemId: drink.id })).length,
      60,
    );
  });

  it("refuses a link to nothing", async () => {
    const repo = d1MenuRepository(createTestD1("ops"));
    await assert.rejects(() =>
      repo.create("ingredients", { name: "Gin", itemId: missingId }),
    );
  });
});

describe("MenuRepository (baserow) storage", () => {
  it("leaves out a column the table doesn't have yet", async () => {
    const world = await fakeWorld();
    const table = world.baserow.tableByName("Menu Items");
    table.fields = table.fields.filter((field) => field.name !== "Prices");
    const repo = baserowMenuRepository(world.env);
    const item = await repo.create("menu_items", {
      name: "Negroni",
      prices: [{ name: "Single", price: "9" }],
      price: "9",
    });
    assert.equal(item.prices, null);
    assert.equal(item.price, "9");
  });

  it("reads a photo from before #183 as legacyPhotoUrl, and won't export it until it's moved", async () => {
    const world = await fakeWorld();
    const repo = baserowMenuRepository(world.env);
    const item = await repo.create("menu_items", { name: "Negroni" });
    world.baserow.update("Menu Items", item.id, {
      Photo: [world.baserow.addFile("old.jpg", new Uint8Array(4))],
    });
    assert.match(
      (await repo.get("menu_items", item.id)).legacyPhotoUrl,
      /old\.jpg$/,
    );
    await assert.rejects(
      () => repo.exportAll(),
      /1 drink photo is still a Baserow file/,
    );
    const { menu_items: items } = await baserowMenuRepository(world.env, {
      leaveOutLegacyPhotos: true,
    }).exportAll();
    assert.equal("legacyPhotoUrl" in items[0], false);
    const moved = await repo.update("menu_items", item.id, {
      photoAsset: ASSET,
    });
    assert.equal(moved.photoAsset, ASSET);
    assert.equal(
      "legacyPhotoUrl" in moved,
      false,
      "the Baserow file goes when ops sets a photo",
    );
  });
});

describe("menuRepository", () => {
  it("stays on Baserow until store:menu says d1, then reads D1", async () => {
    const world = await fakeWorld();
    const OPS_DB = createTestD1("ops");
    await d1MenuRepository(OPS_DB).importAll({
      menu_items: [{ id: 7, name: "On D1" }],
    });
    const env = { ...world.env, OPS_DB };
    await baserowMenuRepository(world.env).create("menu_items", {
      name: "On Baserow",
    });

    assert.deepEqual(
      (await menuRepository(env).list("menu_items")).map((item) => item.name),
      ["On Baserow"],
    );
    await OPS_DB.prepare(
      "INSERT INTO _meta (key, value) VALUES ('store:menu', 'd1')",
    ).run();
    assert.deepEqual(
      (await menuRepository(env).list("menu_items")).map((item) => item.name),
      ["On D1"],
    );
  });

  it("uses env.menuRepository when a test hands one in", () => {
    const repo = memoryMenuRepository();
    assert.equal(menuRepository({ menuRepository: repo }), repo);
  });
});
