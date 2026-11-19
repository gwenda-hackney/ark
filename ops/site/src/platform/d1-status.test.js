import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { run } from "../../../../shared/d1.js";
import { createTestD1 } from "../../../../shared/testing/d1-sqlite.js";
import { d1UserRepository } from "../users/server/adapters/d1-users.js";
import { databaseStatus } from "./d1-status.js";

describe("databaseStatus", () => {
  it("counts each table's records, and says when each feature was last copied in", async () => {
    const OPS_DB = createTestD1("ops");
    OPS_DB.exec(`CREATE TABLE ${"d1_migrations"} (id INTEGER PRIMARY KEY, name TEXT)`);
    OPS_DB.exec("INSERT INTO d1_migrations (name) VALUES ('0001_meta.sql'), ('0003_users.sql')");
    const users = d1UserRepository(OPS_DB);
    await users.create({ name: "Ada", email: "ada@example.com", active: true });
    await users.create({ name: "Bo", email: "bo@example.com", active: true });
    await run(OPS_DB, "INSERT INTO _meta (key, value) VALUES (?, ?)", [
      "moved:users",
      JSON.stringify({ from: "d1:production", at: "2026-11-01T10:00:00.000Z", counts: { users: 2 } }),
    ]);

    const status = await databaseStatus({ SITE_ENV: "dev", OPS_DB }, "ops", {
      now: () => new Date("2026-11-18T12:00:00Z"),
    });

    assert.equal(status.label, "Ops");
    assert.equal(status.name, "gwenda-ops");
    assert.equal(status.environment, "dev");
    assert.equal(status.tables.find((table) => table.name === "users").rows, 2);
    assert.ok(status.tables.every((table) => !["_meta", "d1_migrations"].includes(table.name)), "no bookkeeping tables");
    assert.deepEqual(status.migrations, { count: 2, latest: "0003_users.sql" });
    assert.deepEqual(status.moves, [{ feature: "users", from: "d1:production", at: "2026-11-01T10:00:00.000Z", records: 2 }]);
    assert.equal(status.checkedAt, "2026-11-18T12:00:00.000Z");
  });

  it("refuses a database the page doesn't show", async () => {
    await assert.rejects(databaseStatus({ SITE_ENV: "dev" }, "config"), { status: 400 });
  });
});
