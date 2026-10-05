import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  MAX_PARAMS,
  all,
  batch,
  first,
  fromBool,
  fromJson,
  idList,
  identifier,
  insertRows,
  patchStatement,
  run,
  toBool,
  toJson,
} from "./d1.js";
import { d1Http } from "./d1-http.js";
import { databaseFor } from "./d1-env.js";
import { D1_DATABASES, D1_ROLES } from "./d1-databases.js";
import { createTestD1, migrationFiles } from "./testing/d1-sqlite.js";

/** A test database with two linked tables. */
function shop() {
  const db = createTestD1(null);
  db.exec(`
    CREATE TABLE suppliers (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      supplier_id INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
      active INTEGER NOT NULL DEFAULT 0,
      prices TEXT
    );`);
  return db;
}

describe("test database", () => {
  it("applies each role's migrations", async () => {
    for (const role of D1_ROLES) {
      assert.ok(migrationFiles(role).length >= 1, role);
      const db = createTestD1(role);
      assert.deepEqual(await all(db, "SELECT key FROM _meta"), []);
    }
  });

  it("enforces foreign keys, as D1 does", async () => {
    const db = shop();
    await assert.rejects(
      run(db, "INSERT INTO items (name, supplier_id) VALUES (?, ?)", [
        "Gin",
        99,
      ]),
      /FOREIGN KEY/,
    );
  });

  it("runs a batch as one transaction", async () => {
    const db = shop();
    await assert.rejects(
      batch(db, [
        db.prepare("INSERT INTO suppliers (name) VALUES (?)").bind("Kept?"),
        db
          .prepare("INSERT INTO items (name, supplier_id) VALUES (?, ?)")
          .bind("Bad", 99),
      ]),
    );
    assert.deepEqual(await all(db, "SELECT * FROM suppliers"), []);
  });

  it("refuses undefined and binds booleans as 0/1", async () => {
    const db = shop();
    await assert.rejects(
      run(db, "INSERT INTO suppliers (name) VALUES (?)", [undefined]),
      /undefined/,
    );
    await run(db, "INSERT INTO items (name, active) VALUES (?, ?)", [
      "Tonic",
      true,
    ]);
    assert.equal((await first(db, "SELECT active FROM items")).active, 1);
  });

  it("reports changes and the new row id", async () => {
    const db = shop();
    const meta = await run(db, "INSERT INTO suppliers (name) VALUES (?)", [
      "A",
    ]);
    assert.deepEqual(meta, { changes: 1, last_row_id: 1 });
    assert.equal(
      await first(db, "SELECT * FROM suppliers WHERE id = ?", [2]),
      null,
    );
  });
});

describe("insertRows", () => {
  it("splits rows so no statement passes 100 parameters", async () => {
    const db = shop();
    const rows = Array.from({ length: 120 }, (_, i) => ({
      id: i + 1,
      name: `S${i + 1}`,
    }));
    const statements = insertRows(db, "suppliers", ["id", "name"], rows);
    assert.deepEqual(
      statements.map((s) => s.params.length),
      [MAX_PARAMS, MAX_PARAMS, 40],
    );
    await batch(db, statements);
    assert.equal(
      (await first(db, "SELECT count(*) AS n FROM suppliers")).n,
      120,
    );
  });

  it("keeps given ids and sends null for missing values", async () => {
    const db = shop();
    await batch(
      db,
      insertRows(
        db,
        "items",
        ["id", "name", "supplier_id"],
        [{ id: 7, name: "Rum" }],
      ),
    );
    assert.deepEqual(
      await first(db, "SELECT id, name, supplier_id FROM items"),
      {
        id: 7,
        name: "Rum",
        supplier_id: null,
      },
    );
  });

  it("appends a conflict clause", async () => {
    const db = shop();
    await batch(
      db,
      insertRows(db, "suppliers", ["id", "name"], [{ id: 1, name: "A" }]),
    );
    await batch(
      db,
      insertRows(db, "suppliers", ["id", "name"], [{ id: 1, name: "B" }], {
        conflict: "ON CONFLICT(id) DO UPDATE SET name = excluded.name",
      }),
    );
    assert.equal((await first(db, "SELECT name FROM suppliers")).name, "B");
  });

  it("refuses unsafe names", () => {
    assert.throws(
      () => insertRows(shop(), "items; DROP TABLE x", ["id"], []),
      /identifier/,
    );
    assert.throws(() => identifier("Name"), /identifier/);
  });
});

describe("idList", () => {
  it("matches any number of ids with one parameter", async () => {
    const db = shop();
    const rows = Array.from({ length: 300 }, (_, i) => ({
      id: i + 1,
      name: `S${i + 1}`,
    }));
    await batch(db, insertRows(db, "suppliers", ["id", "name"], rows));
    const ids = rows.filter((row) => row.id % 2 === 0).map((row) => row.id);
    const found = await all(
      db,
      "SELECT id FROM suppliers WHERE id IN (SELECT value FROM json_each(?))",
      [idList(ids)],
    );
    assert.equal(found.length, 150);
  });
});

describe("patchStatement", () => {
  it("updates only the fields given, by their column names", async () => {
    const db = shop();
    await run(db, "INSERT INTO items (name, active) VALUES ('Gin', 1)");
    const columns = { name: "name", active: "active", prices: "prices" };
    await patchStatement(
      db,
      "items",
      1,
      { name: "Old Tom", other: "ignored" },
      columns,
    ).run();
    assert.deepEqual(await first(db, "SELECT name, active FROM items"), {
      name: "Old Tom",
      active: 1,
    });
    assert.equal(patchStatement(db, "items", 1, { other: 1 }, columns), null);
  });
});

describe("column helpers", () => {
  it("round-trip JSON and booleans", () => {
    assert.equal(toJson(null), null);
    assert.deepEqual(fromJson(toJson({ a: [1] })), { a: [1] });
    assert.equal(fromJson("not json", "fallback"), "fallback");
    assert.equal(fromJson("", []).length, 0);
    assert.deepEqual(
      [toBool(true), toBool(0), fromBool(1), fromBool(0)],
      [1, 0, true, false],
    );
  });
});

describe("d1Http", () => {
  /** A fake Cloudflare API that answers with `results` per statement. */
  function fakeApi(answers) {
    const calls = [];
    const fetchImpl = async (url, init) => {
      calls.push({
        url,
        body: JSON.parse(init.body),
        auth: init.headers.Authorization,
      });
      const answer = answers.shift();
      return new Response(JSON.stringify(answer.body), {
        status: answer.status ?? 200,
      });
    };
    return { calls, fetchImpl };
  }
  const ok = (...results) => ({
    body: {
      success: true,
      result: results.map((r) => ({
        results: r,
        success: true,
        meta: { changes: 1 },
      })),
    },
  });

  it("sends a query with its parameters and returns rows", async () => {
    const { calls, fetchImpl } = fakeApi([ok([{ id: 1, name: "A" }])]);
    const db = d1Http({
      accountId: "acc",
      databaseId: "dbid",
      token: "tok",
      fetchImpl,
    });
    assert.deepEqual(
      await all(db, "SELECT * FROM suppliers WHERE id = ?", [1]),
      [{ id: 1, name: "A" }],
    );
    assert.equal(
      calls[0].url,
      "https://api.cloudflare.com/client/v4/accounts/acc/d1/database/dbid/query",
    );
    assert.deepEqual(calls[0].body, {
      sql: "SELECT * FROM suppliers WHERE id = ?",
      params: [1],
    });
    assert.equal(calls[0].auth, "Bearer tok");
  });

  it("sends a batch in one request", async () => {
    const { calls, fetchImpl } = fakeApi([ok([], [])]);
    const db = d1Http({
      accountId: "a",
      databaseId: "d",
      token: "t",
      fetchImpl,
    });
    const results = await batch(
      db,
      insertRows(
        db,
        "suppliers",
        ["id", "name"],
        [{ id: 1, name: "A" }],
      ).concat(db.prepare("DELETE FROM items")),
    );
    assert.equal(results.length, 2);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].body.batch.length, 2);
  });

  it("waits out throttling, and names the error otherwise", async () => {
    const waits = [];
    const { fetchImpl } = fakeApi([
      { status: 429, body: {} },
      {
        status: 400,
        body: { success: false, errors: [{ message: "no such table: x" }] },
      },
    ]);
    const db = d1Http({
      accountId: "a",
      databaseId: "d",
      token: "t",
      fetchImpl,
      wait: async (ms) => waits.push(ms),
    });
    await assert.rejects(
      all(db, "SELECT * FROM x"),
      /D1 query failed: no such table: x/,
    );
    assert.deepEqual(waits, [1000]);
  });
});

describe("databaseFor", () => {
  it("prefers the runtime's binding", () => {
    const binding = createTestD1(null);
    assert.equal(
      databaseFor({ OPS_DB: binding, SITE_ENV: "production" }, "ops"),
      binding,
    );
  });

  it("explains what's missing without a binding", () => {
    assert.throws(
      () => databaseFor({ SITE_ENV: "dev" }, "website"),
      /setup:d1|CLOUDFLARE_API_TOKEN/,
    );
    assert.throws(() => databaseFor({}, "nope"), /Unknown D1 database role/);
  });

  it("names one database per role in each environment", () => {
    for (const env of ["production", "dev"])
      assert.deepEqual(Object.keys(D1_DATABASES[env]), D1_ROLES);
  });
});
