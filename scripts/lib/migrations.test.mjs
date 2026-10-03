import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { describe, it } from "vitest";
import { fileURLToPath } from "node:url";
import {
  DATABASES,
  ENVS,
  baserowDatabase,
  checkMigration,
  loadMigrations,
  openDatabase,
  runMigrations,
  selectMigrations,
} from "./migrations.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

/** A fake Baserow: one table whose columns live in `columns`. */
function fakeBaserow(columns, { failCreate = null } = {}) {
  const calls = [];
  const request = async (_base, _jwt, path, init = {}) => {
    calls.push(`${init.method || "GET"} ${path}`);
    if (path === "/api/workspaces/") return [{ id: 1, name: "Gwenda" }, { id: 2, name: "Gwenda Dev" }];
    if (path === "/api/applications/workspace/2/") return [{ id: 900, type: "database", name: "Website" }];
    if (path === "/api/applications/workspace/1/") {
      return [
        { id: 461843, type: "database", name: "Website" },
      ];
    }
    if (path.startsWith("/api/database/tables/database/")) return [{ id: 42, name: "Form Submissions" }];
    if (path === "/api/database/fields/table/42/" && init.method === "POST") {
      if (failCreate) {
        failCreate(columns);
        throw new Error("POST → 400: field name already exists");
      }
      columns.push({ id: columns.length + 1, ...JSON.parse(init.body) });
      return {};
    }
    if (path === "/api/database/fields/table/42/") return columns.map((c) => ({ ...c }));
    if (path.startsWith("/api/database/fields/") && init.method === "PATCH") {
      const id = Number(path.split("/")[4]);
      Object.assign(columns.find((c) => c.id === id), JSON.parse(init.body));
      return {};
    }
    if (path.startsWith("/api/database/fields/") && init.method === "DELETE") {
      const id = Number(path.split("/")[4]);
      columns.splice(columns.findIndex((c) => c.id === id), 1);
      return null;
    }
    throw new Error(`unexpected ${path}`);
  };
  return { request, calls };
}

const db = (columns, opts) => {
  const fake = fakeBaserow(columns, opts);
  return {
    fake,
    database: baserowDatabase({ apiBase: "x", jwt: "j", databaseId: 7, label: "Website", request: fake.request }),
  };
};

describe("baserowDatabase", () => {
  it("adds a missing column once", async () => {
    const columns = [{ id: 1, name: "Form Slug" }];
    const { database } = db(columns);
    assert.equal(await database.ensureField("Form Submissions", { name: "Edit Link", type: "url" }), "created");
    assert.equal(await database.ensureField("Form Submissions", { name: "Edit Link", type: "url" }), "exists");
    assert.deepEqual(columns.map((c) => c.name), ["Form Slug", "Edit Link"]);
  });

  it("counts a column another deploy just added as done", async () => {
    const columns = [];
    const { database } = db(columns, { failCreate: (cols) => cols.push({ id: 9, name: "Edit Link" }) });
    assert.equal(await database.ensureField("Form Submissions", { name: "Edit Link", type: "url" }), "exists");
  });

  it("still fails when the column could not be added", async () => {
    const { database } = db([], { failCreate: () => {} });
    await assert.rejects(database.ensureField("Form Submissions", { name: "Edit Link" }), /400/);
  });

  it("removes a column only if it's there", async () => {
    const columns = [{ id: 3, name: "Old" }];
    const { database } = db(columns);
    assert.equal(await database.removeField("Form Submissions", "Old"), "removed");
    assert.equal(await database.removeField("Form Submissions", "Old"), "absent");
  });

  it("adds a choice to a single-select column once", async () => {
    const columns = [{ id: 4, name: "Env", select_options: [{ id: 1, value: "dev" }] }];
    const { database } = db(columns);
    assert.equal(await database.ensureSelectOption("Form Submissions", "Env", "preview"), "created");
    assert.equal(await database.ensureSelectOption("Form Submissions", "Env", "preview"), "exists");
    assert.deepEqual(columns[0].select_options.map((o) => o.value), ["dev", "preview"]);
  });

  it("adds a table with just its key column, once", async () => {
    const created = [];
    const request = async (_base, _jwt, path, init = {}) => {
      if (path === "/api/database/tables/database/7/" && init.method === "POST") {
        const body = JSON.parse(init.body);
        created.push(body);
        return { id: 50, name: body.name };
      }
      if (path === "/api/database/tables/database/7/") return [{ id: 42, name: "Form Submissions" }];
      throw new Error(`unexpected ${path}`);
    };
    const database = baserowDatabase({ apiBase: "x", jwt: "j", databaseId: 7, label: "Ops", request });
    assert.equal(await database.ensureTable("Guest artists", "Email"), "created");
    assert.equal(await database.ensureTable("Guest artists", "Email"), "exists");
    assert.equal(await database.ensureTable("Form Submissions", "Email"), "exists");
    assert.deepEqual(created, [{ name: "Guest artists", data: [["Email"]], first_row_header: true }]);
  });

  it("removes a table once, and only that one", async () => {
    const deleted = [];
    const request = async (_base, _jwt, path, init = {}) => {
      if (init.method === "DELETE") {
        deleted.push(path);
        return null;
      }
      if (path === "/api/database/tables/database/7/") {
        return [
          { id: 42, name: "Subscribers" },
          { id: 43, name: "Subscribe sync runs" },
        ];
      }
      throw new Error(`unexpected ${path}`);
    };
    const database = baserowDatabase({ apiBase: "x", jwt: "j", databaseId: 7, label: "Website", request });
    assert.equal(await database.removeTable("Subscribe sync runs"), "removed");
    assert.equal(await database.removeTable("Subscribe sync runs"), "absent");
    assert.deepEqual(deleted, ["/api/database/tables/43/"]);
  });

  it("removing the sync runs table never runs outside production", async () => {
    const [migration] = (await loadMigrations(resolve(ROOT, "migrations"))).filter(
      (m) => m.name === "2026-10-03-remove-sync-runs-table.mjs",
    );
    const lines = [];
    // No database: it would throw if it tried to open one.
    await migration.up({ env: "dev", database: null, log: (line) => lines.push(line) });
    assert.deepEqual(lines, ["production only"]);
  });

  it("names a missing table", async () => {
    const { database } = db([]);
    await assert.rejects(database.fields("Nope"), /Website: table "Nope" not found/);
  });
});

describe("openDatabase", () => {
  it("finds each environment's own database", async () => {
    const { request } = fakeBaserow([]);
    const dev = await openDatabase({ apiBase: "x", jwt: "j", key: "website", env: "dev", request });
    assert.equal(dev.label, "Gwenda Dev / Website");
    const production = await openDatabase({ apiBase: "x", jwt: "j", key: "website", env: "production", request });
    assert.equal(production.label, "Gwenda / Website");
  });

  it("refuses a database an environment doesn't have", async () => {
    await assert.rejects(openDatabase({ key: "ops", env: "staging" }), /no ops database in staging/);
    await assert.rejects(openDatabase({ key: "website", env: "staging" }), /no website database in staging/);
  });

  it("maps every environment for each database, each in its own workspace", () => {
    for (const key of ["website", "ops", "config"]) {
      assert.deepEqual(Object.keys(DATABASES[key]), ENVS);
      assert.notEqual(DATABASES[key].dev[0], DATABASES[key].production[0]);
    }
  });
});

describe("migrations", () => {
  const up = async () => {};

  it("rejects a migration missing its exports", () => {
    assert.throws(() => checkMigration("x.mjs", { app: "web", phase: "during", up }), /phase.*about/);
  });

  it("runs only this app's migrations for this phase, in order", async () => {
    const ran = [];
    const make = (name, app, phase) =>
      checkMigration(name, { app, phase, about: name, up: async () => ran.push(name) });
    const all = [make("1.mjs", "web", "pre"), make("2.mjs", "ops", "pre"), make("3.mjs", "web", "post"), make("4.mjs", "web", "pre")];
    await runMigrations(selectMigrations(all, { app: "web", phase: "pre" }), {
      env: "dev",
      database: async () => null,
      log: () => {},
    });
    assert.deepEqual(ran, ["1.mjs", "4.mjs"]);
  });

  it("every file in migrations/ is a valid migration", async () => {
    const loaded = await loadMigrations(resolve(ROOT, "migrations"));
    assert.ok(loaded.length > 0);
  });

  it("removing dev's rows never runs outside production", async () => {
    const [cleanup] = (await loadMigrations(resolve(ROOT, "migrations"))).filter(
      (m) => m.name === "2026-10-02-config-dev-rows.mjs",
    );
    const lines = [];
    // No config token: it would throw if it tried to touch the database.
    await cleanup.up({ env: "dev", processEnv: {}, log: (line) => lines.push(line) });
    assert.deepEqual(lines, ["production only"]);
  });
});
