import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { all, run } from "./d1.js";
import { checkD1 } from "./d1-health.js";
import { createTestD1 } from "./testing/d1-sqlite.js";

/** Wrangler's record of applied migrations, which createTestD1 doesn't keep. */
async function recordMigrations(db, names) {
  await run(
    db,
    "CREATE TABLE d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TEXT)",
  );
  for (const name of names)
    await run(db, "INSERT INTO d1_migrations (name) VALUES (?)", [name]);
}

describe("checkD1", () => {
  it("reports the migrations and leaves no test row behind", async () => {
    const db = createTestD1("website");
    await recordMigrations(db, ["0001_meta.sql"]);
    const detail = await checkD1(db, { uuid: () => "abc" });
    assert.equal(
      detail,
      "1 migration (latest 0001_meta.sql), write and delete ok",
    );
    assert.deepEqual(await all(db, "SELECT key FROM _meta"), []);
  });

  it("names the latest of several migrations", async () => {
    const db = createTestD1("ops");
    await recordMigrations(db, ["0001_meta.sql", "0002_events.sql"]);
    assert.match(
      await checkD1(db),
      /^2 migrations \(latest 0002_events\.sql\)/,
    );
  });

  it("fails clearly when the database isn't bound or was never migrated", async () => {
    await assert.rejects(checkD1(undefined), /not bound/);
    await assert.rejects(checkD1(createTestD1(null)), /no migrations applied/);
    const empty = createTestD1("config");
    await recordMigrations(empty, []);
    await assert.rejects(checkD1(empty), /no migrations applied/);
  });

  it("fails when it can't write", async () => {
    const db = createTestD1(null);
    await recordMigrations(db, ["0001_meta.sql"]);
    // No _meta table: the write fails.
    await assert.rejects(checkD1(db), /no such table: _meta/);
  });
});
