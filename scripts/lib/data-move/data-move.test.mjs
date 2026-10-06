import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { run } from "../../../shared/d1.js";
import {
  d1Table,
  exportTables,
  importTables,
} from "../../../shared/d1-table.js";
import { createTestD1 } from "../../../shared/testing/d1-sqlite.js";
import { parseArgs } from "../../data-move.mjs";
import { createFakeWorld } from "../../../ops/site/src/testing/fake-world.js";
import { FEATURES, featureFor } from "./features.mjs";
import { diffSnapshots, keptSnapshot, moveFeature } from "./index.mjs";

/** A repository in memory: exportAll / importAll only, like a Baserow source plus a target. */
function memory(snapshot = {}) {
  let data = structuredClone(snapshot);
  return {
    async exportAll() {
      return structuredClone(data);
    },
    async importAll(next) {
      data = structuredClone(next);
    },
  };
}

const people = d1Table({
  table: "people",
  columns: { id: "int", email: "text", tags: "json" },
});

/** A D1 repository over one table, as a feature's adapter composes them. */
async function d1People() {
  const db = createTestD1(null);
  await run(
    db,
    "CREATE TABLE people (id INTEGER PRIMARY KEY, email TEXT NOT NULL, tags TEXT)",
  );
  return {
    async exportAll() {
      const { people: rows } = await exportTables(db, [people]);
      return { people: rows };
    },
    async importAll(snapshot) {
      await importTables(db, [[people, snapshot.people]]);
    },
  };
}

const SNAPSHOT = {
  people: [
    { id: 3, email: "a@example.com", tags: ["prelaunch"] },
    {
      id: 9,
      email: "alerts+signup-smoke@gwenda.co.uk",
      tags: ["prelaunch", "wifi"],
    },
  ],
};

describe("moveFeature", () => {
  it("copies into D1 keeping ids, leaves out what the feature never copies, and checks", async () => {
    const lines = [];
    const target = await d1People();
    const result = await moveFeature({
      source: memory(SNAPSHOT),
      target,
      keep: (_collection, record) => !record.email.startsWith("alerts+"),
      log: (line) => lines.push(line),
    });
    assert.deepEqual(result, { counts: { people: 1 }, skipped: { people: 1 } });
    assert.deepEqual(await target.exportAll(), {
      people: [SNAPSHOT.people[0]],
    });
    assert.deepEqual(lines, [
      "exported: 1 people (left out: 1 people)",
      "imported",
      "checked: the target matches the source record for record",
    ]);
  });

  it("fails when the target doesn't read back what went in", async () => {
    const lossy = {
      ...memory(),
      async exportAll() {
        return { people: [{ ...SNAPSHOT.people[0], tags: [] }] };
      },
    };
    const lines = [];
    await assert.rejects(
      moveFeature({
        source: memory(SNAPSHOT),
        target: lossy,
        log: (line) => lines.push(line),
      }),
      /2 difference\(s\)/,
    );
    assert.ok(lines.includes("  people 3: changed (tags)"));
    assert.ok(lines.includes("  people 9: missing"));
  });
});

describe("diffSnapshots", () => {
  it("compares by id, ignores key order, and never reports values", () => {
    const a = { x: [{ id: 1, v: { b: 1, a: 2 } }, { id: 2 }] };
    const b = { x: [{ id: 1, v: { a: 2, b: 1 } }, { id: 3 }], y: [{ id: 1 }] };
    assert.deepEqual(diffSnapshots(a, b), [
      { collection: "x", id: "2", kind: "missing" },
      { collection: "x", id: "3", kind: "extra" },
      { collection: "y", id: "1", kind: "extra" },
    ]);
  });

  it("config moves only the first row of each name + env + service", () => {
    const row = (id, value) => ({
      id,
      name: "a",
      value,
      env: "dev",
      service: "ops",
    });
    const records = [
      row(3, "kept"),
      row(9, "never read"),
      { ...row(4, "x"), env: "all" },
    ];
    assert.deepEqual(
      keptSnapshot(
        { config_values: records },
        FEATURES.config.keep,
      ).config_values.map((r) => r.id),
      [3, 4],
    );
    assert.equal(FEATURES.config.freeze, false);
  });

  it("keptSnapshot filters per collection", () => {
    assert.deepEqual(
      keptSnapshot({ a: [{ id: 1 }, { id: 2 }] }, (_c, r) => r.id === 2),
      { a: [{ id: 2 }] },
    );
  });
});

describe("data-move CLI", () => {
  it("parses sides, defaults to a dry run, and only moves onto D1", () => {
    assert.deepEqual(
      parseArgs([
        "--feature",
        "events",
        "--from",
        "baserow:production",
        "--to",
        "d1:production",
      ]),
      {
        feature: "events",
        from: { kind: "baserow", env: "production" },
        to: { kind: "d1", env: "production" },
        write: false,
      },
    );
    assert.throws(
      () =>
        parseArgs([
          "--feature",
          "e",
          "--from",
          "d1:dev",
          "--to",
          "baserow:dev",
        ]),
      /only ever moves onto D1/,
    );
    assert.throws(
      () =>
        parseArgs([
          "--feature",
          "e",
          "--from",
          "baserow:staging",
          "--to",
          "d1:dev",
        ]),
      /--from must be/,
    );
    assert.throws(
      () => parseArgs(["--feature", "e", "--from", "d1:dev", "--to", "d1:dev"]),
      /the same/,
    );
  });

  it("names the features it knows", () => {
    assert.throws(() => featureFor("nope", { events: {} }), /Known: events\./);
    assert.throws(() => featureFor("nope", {}), /None can move yet/);
  });
});

describe("the menu feature", () => {
  it("moves from Baserow to D1 record for record", async () => {
    const world = await createFakeWorld();
    world.install();
    try {
      const { menu } = FEATURES;
      assert.deepEqual([menu.app, menu.role, menu.freeze], ["ops", "ops", true]);
      const source = menu.adapters.baserow({ env: world.env });
      const section = await source.create("menu_sections", { name: "Cocktails", slug: "cocktails" });
      const fall = await source.create("pos_menus", { name: "Fall 2026", isDefault: true });
      const drink = await source.create("menu_items", { name: "Negroni", sectionId: section.id, posMenuIds: [fall.id] });
      const gin = await source.create("inventory", { name: "Gin", abv: "40" });
      await source.create("ingredients", { name: "Gin", itemId: drink.id, inventoryId: gin.id, quantity: 30, unit: "ml" });
      await source.create("menu_placements", { itemId: drink.id, channel: "pos", posMenuId: fall.id, posScreen: "Classic" });
      const lwc = await source.create("suppliers", { name: "LWC Drinks" });
      await source.create("inventory_suppliers", { name: "LWC Drinks", inventoryId: gin.id, supplierId: lwc.id, price: 19.5 });

      const db = createTestD1("ops");
      const { counts } = await moveFeature({ source, target: menu.adapters.d1({ db }) });
      assert.deepEqual(counts, {
        menu_sections: 1,
        pos_menus: 1,
        menu_items: 1,
        menu_placements: 1,
        inventory: 1,
        ingredients: 1,
        suppliers: 1,
        inventory_suppliers: 1,
      });
      assert.deepEqual((await menu.adapters.d1({ db }).get("menu_items", drink.id)).posMenuIds, [fall.id]);
    } finally {
      world.restore();
    }
  });
});
