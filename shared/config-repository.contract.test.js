/**
 * What every ConfigRepository adapter must do (config-repository.js): the
 * same cases on memory, Baserow (a fake Config table) and D1 (SQLite with
 * the real migrations), plus the shared copy round trip.
 */
import assert from "node:assert/strict";
import { afterEach, describe, it } from "vitest";
import { baserowConfigRepository } from "./config-adapters/baserow-config.js";
import { d1ConfigRepository } from "./config-adapters/d1-config.js";
import { memoryConfigRepository } from "./config-adapters/memory-config.js";
import { resetConfigCacheForTests } from "./config.js";
import { configRepository } from "./config-repository.js";
import { createTestD1 } from "./testing/d1-sqlite.js";
import { repositoryContract } from "./testing/repository-contract.js";

const realFetch = globalThis.fetch;

/** A Baserow that holds one Config table, enough for the Baserow adapter. */
function fakeBaserow() {
  let rows = [];
  let nextId = 1;
  const json = (body, status = 200) =>
    new Response(body == null ? null : JSON.stringify(body), { status });
  globalThis.fetch = async (url, init = {}) => {
    const path = new URL(String(url)).pathname;
    if (path.endsWith("/all-tables/"))
      return json([{ id: 5, name: "Config", database_id: 1 }]);
    const id = Number(path.match(/\/table\/5\/(\d+)\/$/)?.[1]);
    const method = init.method || "GET";
    if (method === "GET") return json({ results: rows, next: null });
    if (method === "DELETE") {
      rows = rows.filter((row) => row.id !== id);
      return json(null, 204);
    }
    const fields = JSON.parse(init.body);
    const scoped = {
      ...fields,
      Env: { value: fields.Env },
      Service: { value: fields.Service },
    };
    if (method === "POST") {
      const row = { id: nextId++, ...scoped };
      rows.push(row);
      return json(row);
    }
    const row = rows.find((r) => r.id === id);
    Object.assign(row, scoped);
    return json(row);
  };
  resetConfigCacheForTests();
  return baserowConfigRepository({ BASEROW_CONFIG_API_KEY: "k" });
}

afterEach(() => {
  globalThis.fetch = realFetch;
  resetConfigCacheForTests();
});

const slot = (name, env, service) => ({ name, env, service });

repositoryContract("ConfigRepository", {
  adapters: {
    memory: () => memoryConfigRepository(),
    baserow: () => fakeBaserow(),
    d1: () => d1ConfigRepository(createTestD1("config")),
  },
  seed: async (repo) => {
    await repo.set({ ...slot("sanity.project_id", "all", "all"), value: "a" });
    await repo.set({ ...slot("sanity.project_id", "dev", "all"), value: "b" });
    await repo.set({
      ...slot("site.build_snapshot", "preview", "web"),
      value: '{"at":"2026-10-06"}',
    });
  },
  cases: {
    "a set creates the record, and a second set updates it": async (repo) => {
      const created = await repo.set({
        ...slot("pour_target.beer", "dev", "ops"),
        value: "22",
      });
      assert.deepEqual(created, {
        id: created.id,
        name: "pour_target.beer",
        value: "22",
        env: "dev",
        service: "ops",
      });
      const updated = await repo.set({
        ...slot("pour_target.beer", "dev", "ops"),
        value: "24",
      });
      assert.equal(updated.id, created.id);
      assert.deepEqual(
        (await repo.list()).map((r) => r.value),
        ["24"],
      );
    },
    "one name keeps a record per env and service": async (repo) => {
      await repo.set({ ...slot("x", "all", "all"), value: "1" });
      await repo.set({ ...slot("x", "dev", "all"), value: "2" });
      await repo.set({ ...slot("x", "dev", "web"), value: "3" });
      assert.equal((await repo.list()).length, 3);
      assert.equal((await repo.find(slot("x", "dev", "all"))).value, "2");
      assert.equal(await repo.find(slot("x", "production", "all")), null);
    },
    "names are trimmed and scopes lowercased": async (repo) => {
      await repo.set({ ...slot(" a.b ", "Dev", ""), value: "v" });
      const found = await repo.find(slot("a.b", "dev", "all"));
      assert.equal(found?.value, "v");
    },
    "removeNamed takes every record of that name, nothing else": async (
      repo,
    ) => {
      await repo.set({ ...slot("old", "dev", "ops"), value: "1" });
      await repo.set({ ...slot("old", "all", "all"), value: "2" });
      await repo.set({ ...slot("kept", "dev", "ops"), value: "3" });
      assert.equal(await repo.removeNamed("old"), 2);
      assert.equal(await repo.removeNamed("old"), 0);
      assert.deepEqual(
        (await repo.list()).map((r) => r.name),
        ["kept"],
      );
    },
    "removeEnv takes every record of one Env": async (repo) => {
      await repo.set({ ...slot("a", "staging", "web"), value: "1" });
      await repo.set({ ...slot("b", "staging", "ops"), value: "2" });
      await repo.set({ ...slot("a", "dev", "web"), value: "3" });
      assert.equal(await repo.removeEnv("staging"), 2);
      assert.deepEqual(
        (await repo.list()).map((r) => r.env),
        ["dev"],
      );
    },
    "a runtime reads its own write at once": async (repo) => {
      await repo.list();
      await repo.set({ ...slot("fresh", "dev", "ops"), value: "1" });
      assert.equal((await repo.list()).length, 1);
    },
    "exportAll carries every record by id": async (repo) => {
      await repo.set({ ...slot("b", "dev", "ops"), value: "2" });
      await repo.set({ ...slot("a", "dev", "ops"), value: "1" });
      const { config_values: records } = await repo.exportAll();
      assert.deepEqual(
        records.map((r) => r.name),
        ["b", "a"],
      );
      assert.ok(records.every((r) => typeof r.id === "number"));
    },
  },
});

describe("ConfigRepository on D1", () => {
  it("two writers to one slot leave one row", async () => {
    const db = createTestD1("config");
    const one = d1ConfigRepository(db);
    const two = d1ConfigRepository(db, { cacheKey: "other" });
    await Promise.all([
      one.set({ ...slot("site.tick", "dev", "ops"), value: "1" }),
      two.set({ ...slot("site.tick", "dev", "ops"), value: "2" }),
    ]);
    assert.equal((await one.exportAll()).config_values.length, 1);
  });

  it("an import keeps Baserow's ids, and later rows count on from them", async () => {
    const repo = d1ConfigRepository(createTestD1("config"));
    await repo.importAll({
      config_values: [
        { id: 40, name: "a", value: "1", env: "dev", service: "ops" },
      ],
    });
    const added = await repo.set({ ...slot("b", "dev", "ops"), value: "2" });
    assert.ok(added.id > 40);
  });
});

describe("configRepository", () => {
  it("stays on Baserow while D1 can't be reached", async () => {
    const repo = configRepository({
      SITE_ENV: "dev",
      BASEROW_CONFIG_API_KEY: "",
    });
    await assert.rejects(repo.list(), /BASEROW_CONFIG_API_KEY/);
  });

  it("goes to D1 once _meta says so", async () => {
    const db = createTestD1("config");
    db.exec("INSERT INTO _meta (key, value) VALUES ('store:config', 'd1')");
    await d1ConfigRepository(db).set({
      ...slot("sanity.project_id", "dev", "all"),
      value: "gwscpagy",
    });
    resetConfigCacheForTests();
    const repo = configRepository({ SITE_ENV: "dev", CONFIG_DB: db });
    assert.equal((await repo.list())[0].value, "gwscpagy");
  });

  it("takes a repository handed in by a test", () => {
    const repo = memoryConfigRepository();
    assert.equal(configRepository({ configRepository: repo }), repo);
  });
});
