import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { batch, first } from "./d1.js";
import { COPY_BATCH, d1Table, exportTables, importTables } from "./d1-table.js";
import { createTestD1 } from "./testing/d1-sqlite.js";
import {
  copyRoundTrip,
  repositoryContract,
} from "./testing/repository-contract.js";

// A small sample feature: suppliers and the items they sell.
const SCHEMA = `
  CREATE TABLE suppliers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE,
    website TEXT
  );
  CREATE TABLE items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    supplier_id INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
    active INTEGER NOT NULL DEFAULT 0,
    prices TEXT,
    counted_at TEXT
  );`;

const suppliers = d1Table({
  table: "suppliers",
  columns: {
    id: "int",
    name: "text",
    email: "text",
    website: { column: "website", type: "text" },
  },
  orderBy: "name, id",
});
const items = d1Table({
  table: "items",
  columns: {
    id: "int",
    name: "text",
    supplierId: "int",
    active: "bool",
    prices: "json",
    countedAt: "date",
  },
});

function shopDb() {
  const db = createTestD1(null);
  db.exec(SCHEMA);
  return db;
}

describe("d1Table: mapping", () => {
  it("maps fields to snake_case columns and decodes types", async () => {
    const db = shopDb();
    const supplier = await suppliers.insert(db, {
      name: "Kernel",
      email: "k@x.test",
    });
    const item = await items.insert(db, {
      name: "Pale ale",
      supplierId: supplier.id,
      active: true,
      prices: { pint: 6.5 },
      countedAt: "2026-10-05T09:00:00.000Z",
      notAColumn: "ignored",
    });
    assert.deepEqual(item, {
      id: 1,
      name: "Pale ale",
      supplierId: 1,
      active: true,
      prices: { pint: 6.5 },
      countedAt: "2026-10-05T09:00:00.000Z",
    });
    const row = await first(
      db,
      "SELECT supplier_id, active, prices FROM items",
    );
    assert.deepEqual(row, {
      supplier_id: 1,
      active: 1,
      prices: '{"pint":6.5}',
    });
  });

  it("gives empty columns their type's empty value", () => {
    assert.deepEqual(
      items.toRecord({
        id: 3,
        name: "x",
        supplier_id: null,
        active: 0,
        prices: null,
        counted_at: null,
      }),
      {
        id: 3,
        name: "x",
        supplierId: null,
        active: false,
        prices: null,
        countedAt: null,
      },
    );
  });

  it("refuses unknown types, a missing id and unsafe names", () => {
    assert.throws(
      () => d1Table({ table: "t", columns: { id: "int", x: "float" } }),
      /type must be one of/,
    );
    assert.throws(
      () => d1Table({ table: "t", columns: { x: "text" } }),
      /integer "id"/,
    );
    assert.throws(
      () =>
        d1Table({
          table: "t",
          columns: { id: "int", x: { column: "x; --", type: "text" } },
        }),
      /identifier/,
    );
  });
});

describe("d1Table: operations", () => {
  it("gets, lists in order, patches only given fields, and removes", async () => {
    const db = shopDb();
    await suppliers.insert(db, { name: "Zed" });
    await suppliers.insert(db, { name: "Abel", website: "https://abel.test" });
    assert.deepEqual(
      (await suppliers.list(db)).map((s) => s.name),
      ["Abel", "Zed"],
    );
    assert.deepEqual(
      (await suppliers.list(db, { where: "name = ?", params: ["Zed"] })).map(
        (s) => s.id,
      ),
      [1],
    );

    const patched = await suppliers.patch(db, 2, { name: "Abel & Co", id: 99 });
    assert.deepEqual(patched, {
      id: 2,
      name: "Abel & Co",
      email: null,
      website: "https://abel.test",
    });
    assert.equal(await suppliers.patch(db, 42, { name: "nobody" }), null);

    await suppliers.remove(db, 1);
    assert.equal(await suppliers.get(db, 1), null);
  });

  it("upserts on a unique column without touching the id", async () => {
    const db = shopDb();
    const first1 = await suppliers.upsert(
      db,
      { name: "Kernel", email: "k@x.test" },
      ["email"],
    );
    const again = await suppliers.upsert(
      db,
      { name: "Kernel Brewery", email: "k@x.test" },
      ["email"],
    );
    assert.equal(again.id, first1.id);
    assert.equal(again.name, "Kernel Brewery");
  });

  it("puts changes to several tables in one transaction", async () => {
    const db = shopDb();
    await assert.rejects(
      batch(db, [
        suppliers.insertStatement(db, { id: 1, name: "Kept?" }),
        items.insertStatement(db, { name: "Orphan", supplierId: 404 }),
      ]),
      /FOREIGN KEY/,
    );
    assert.deepEqual(await suppliers.list(db), []);
  });
});

describe("importTables / exportTables", () => {
  it("replaces linked tables with ids kept, under D1's limits", async () => {
    const db = shopDb();
    await suppliers.insert(db, { name: "Old" });
    const snapshot = {
      suppliers: Array.from({ length: 40 }, (_, i) => ({
        id: i + 10,
        name: `S${i}`,
        email: null,
        website: null,
      })),
      items: Array.from({ length: 1200 }, (_, i) => ({
        id: i + 1000,
        name: `I${i}`,
        supplierId: 10 + (i % 40),
        active: i % 2 === 0,
        prices: i % 3 ? null : { pint: i },
        countedAt: null,
      })),
    };
    const { statements } = await importTables(db, [
      [suppliers, snapshot.suppliers],
      [items, snapshot.items],
    ]);
    assert.ok(statements > COPY_BATCH, "large enough to need several batches");
    const out = await exportTables(db, [suppliers, items]);
    assert.deepEqual(out, snapshot);
    // New rows continue after the imported ids.
    assert.equal((await items.insert(db, { name: "New" })).id, 2200);
  });
});

// The harness, on a sample repository with a D1 and a memory adapter.
function d1SupplierRepo() {
  const db = shopDb();
  return {
    add: (fields) => suppliers.insert(db, fields),
    list: () => suppliers.list(db),
    exportAll: () => exportTables(db, [suppliers, items]),
    importAll: (snapshot) =>
      importTables(db, [
        [suppliers, snapshot.suppliers],
        [items, snapshot.items],
      ]),
  };
}

function memorySupplierRepo({ dropWebsite = false } = {}) {
  let data = { suppliers: [], items: [] };
  return {
    async add(fields) {
      const record = {
        id: data.suppliers.length + 1,
        name: "",
        email: null,
        website: null,
        ...fields,
      };
      data.suppliers.push(record);
      return record;
    },
    list: async () =>
      [...data.suppliers].sort(
        (a, b) => a.name.localeCompare(b.name) || a.id - b.id,
      ),
    exportAll: async () => structuredClone(data),
    async importAll(snapshot) {
      data = structuredClone(snapshot);
      if (dropWebsite) for (const s of data.suppliers) s.website = null;
    },
  };
}

const seed = async (repo) => {
  await repo.add({ name: "Kernel", website: "https://kernel.test" });
  await repo.add({ name: "Abel" });
};

repositoryContract("SupplierRepository (sample)", {
  adapters: { d1: d1SupplierRepo, memory: () => memorySupplierRepo() },
  seed,
  cases: {
    "lists suppliers by name": async (repo) => {
      await seed(repo);
      assert.deepEqual(
        (await repo.list()).map((s) => s.name),
        ["Abel", "Kernel"],
      );
    },
  },
});

describe("copyRoundTrip", () => {
  it("catches an adapter that drops a field on import", async () => {
    await assert.rejects(
      copyRoundTrip(
        d1SupplierRepo(),
        memorySupplierRepo({ dropWebsite: true }),
        seed,
      ),
      /importAll\(exportAll\(\)\) changed the records/,
    );
  });
});
