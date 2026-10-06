import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { run } from "./d1.js";
import { storeOf, switchedRepository } from "./data-store.js";
import { createTestD1 } from "./testing/d1-sqlite.js";
import { parseArgs } from "../scripts/d1-store.mjs";

describe("storeOf", () => {
  it("is Baserow until _meta says d1, and Baserow where D1 can't be reached", async () => {
    const env = { OPS_DB: createTestD1("ops") };
    assert.equal(await storeOf(env, "users", { now: 0 }), "baserow");
    await run(
      env.OPS_DB,
      "INSERT INTO _meta (key, value) VALUES ('store:users', 'd1')",
    );
    assert.equal(await storeOf(env, "users", { now: 60_000 }), "d1");
    assert.equal(await storeOf(env, "menu"), "baserow");
    assert.equal(await storeOf({}, "users"), "baserow");
    assert.equal(
      await storeOf({ OPS_DB: createTestD1(null) }, "users"),
      "baserow",
      "before 0001_meta",
    );
  });

  it("can be pinned, and throws rather than guess when D1 fails", async () => {
    assert.equal(await storeOf({ DATA_STORE_CONFIG: "d1" }, "config"), "d1");
    await assert.rejects(
      storeOf({ DATA_STORE_USERS: "mysql" }, "users"),
      /must be baserow or d1/,
    );
    const broken = {
      prepare: () => ({
        bind: () => ({
          first: async () => Promise.reject(new Error("D1 down")),
        }),
      }),
    };
    await assert.rejects(
      storeOf({ OPS_DB: broken }, "users"),
      /Can't tell where users lives/,
    );
    await assert.rejects(storeOf({}, "rsvp"), /Unknown feature/);
  });
});

describe("storeOf cache", () => {
  it("reads _meta once per few seconds per runtime, not per call", async () => {
    const db = createTestD1("ops");
    let reads = 0;
    const counting = { prepare: (sql) => (reads++, db.prepare(sql)) };
    const env = { OPS_DB: counting };
    await storeOf(env, "users", { now: 1000 });
    await storeOf(env, "users", { now: 2000 });
    assert.equal(reads, 1);
    await run(
      db,
      "INSERT INTO _meta (key, value) VALUES ('store:users', 'd1')",
    );
    assert.equal(
      await storeOf(env, "users", { now: 7000 }),
      "d1",
      "seen once the cache is older than STORE_CACHE_MS",
    );
    assert.equal(reads, 2);
  });
});

describe("switchedRepository", () => {
  it("picks the adapter once, on the first call", async () => {
    const env = { OPS_DB: createTestD1("ops") };
    await run(
      env.OPS_DB,
      "INSERT INTO _meta (key, value) VALUES ('store:users', 'd1')",
    );
    let made = 0;
    const repo = switchedRepository(env, "users", {
      baserow: () => ({ list: async () => "baserow" }),
      d1: () => (made++, { list: async (x) => `d1 ${x}` }),
    });
    assert.equal(await repo.list(1), "d1 1");
    assert.equal(await repo.list(2), "d1 2");
    assert.equal(made, 1);
    await assert.rejects(repo.nothing(), /has no nothing\(\)/);
    assert.equal(
      (await Promise.resolve(repo)) === repo,
      true,
      "awaiting it isn't a call",
    );
  });
});

describe("d1:store CLI", () => {
  it("parses a switch and a list", () => {
    assert.deepEqual(
      parseArgs(["--env", "dev", "--feature", "config", "--to", "d1"]),
      {
        env: "dev",
        feature: "config",
        to: "d1",
        list: false,
      },
    );
    assert.throws(
      () => parseArgs(["--env", "dev", "--feature", "users", "--to", "sqlite"]),
      /--to must be/,
    );
    assert.equal(parseArgs(["--env", "production", "--list"]).list, true);
  });
});
