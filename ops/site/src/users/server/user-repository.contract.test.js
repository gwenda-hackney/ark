/**
 * What every UserRepository adapter must do (#186, #127): the same cases run
 * on memory, Baserow (the fake world) and D1 (SQLite with the real
 * migrations), plus the copy between them that data-move relies on.
 */
import assert from "node:assert/strict";
import { afterEach, describe, it } from "vitest";
import { createTestD1 } from "../../../../../shared/testing/d1-sqlite.js";
import { repositoryContract } from "../../../../../shared/testing/repository-contract.js";
import { createFakeWorld } from "../../testing/fake-world.js";
import { baserowUserRepository } from "./adapters/baserow-users.js";
import { d1UserRepository } from "./adapters/d1-users.js";
import { memoryUserRepository } from "./adapters/memory-users.js";
import { usersRepository } from "./user-repository.js";

const worlds = [];
afterEach(() => {
  while (worlds.length) worlds.pop().restore();
});

const ADAPTERS = {
  memory: () => memoryUserRepository(),
  baserow: async () => {
    const world = await createFakeWorld();
    world.install();
    worlds.push(world);
    return baserowUserRepository(world.env);
  },
  d1: () => d1UserRepository(createTestD1("ops")),
};

const missingId = 987_654;

repositoryContract("UserRepository", {
  adapters: ADAPTERS,
  seed: async (repo) => {
    await repo.create({ name: "Ada", email: "ada@gwenda.co.uk", active: true });
    await repo.create({ name: "", email: "Gone@Gwenda.co.uk", active: false });
  },
  cases: {
    "creates a user and reads it back": async (repo) => {
      const created = await repo.create({
        name: " Ada ",
        email: " Ada@Gwenda.co.uk ",
        active: true,
      });
      assert.equal(typeof created.id, "number");
      assert.deepEqual(created, {
        id: created.id,
        name: "Ada",
        email: "ada@gwenda.co.uk",
        active: true,
      });
      assert.deepEqual(await repo.get(created.id), created);
      assert.deepEqual(await repo.get(String(created.id)), created);
    },
    "lists every user by id, inactive ones too": async (repo) => {
      const a = await repo.create({
        name: "A",
        email: "a@gwenda.co.uk",
        active: true,
      });
      const b = await repo.create({
        name: "B",
        email: "b@gwenda.co.uk",
        active: false,
      });
      const listed = (await repo.list()).filter((u) =>
        [a.id, b.id].includes(u.id),
      );
      assert.deepEqual(listed, [a, b]);
      const ids = (await repo.list()).map((u) => u.id);
      assert.deepEqual(
        ids,
        [...ids].sort((x, y) => x - y),
      );
    },
    "update changes only the given fields": async (repo) => {
      const user = await repo.create({
        name: "Ada",
        email: "ada@gwenda.co.uk",
        active: true,
      });
      const off = await repo.update(user.id, { active: false });
      assert.deepEqual(off, { ...user, active: false });
      const renamed = await repo.update(String(user.id), {
        name: "Ada L",
        email: "ADA.L@gwenda.co.uk",
      });
      assert.deepEqual(renamed, {
        id: user.id,
        name: "Ada L",
        email: "ada.l@gwenda.co.uk",
        active: false,
      });
      assert.deepEqual(await repo.get(user.id), renamed);
    },
    "a missing user: get is null, update is a 404, remove is fine": async (
      repo,
    ) => {
      assert.equal(await repo.get(missingId), null);
      await assert.rejects(
        () => repo.update(missingId, { active: false }),
        (error) => error.status === 404,
      );
      await repo.remove(missingId);
    },
    "removes a user": async (repo) => {
      const user = await repo.create({
        name: "Ada",
        email: "ada@gwenda.co.uk",
        active: true,
      });
      await repo.remove(user.id);
      assert.equal(await repo.get(user.id), null);
      assert.ok(!(await repo.list()).some((u) => u.id === user.id));
    },
    "exports every user": async (repo) => {
      const user = await repo.create({
        name: "Ada",
        email: "ada@gwenda.co.uk",
        active: false,
      });
      const { users } = await repo.exportAll();
      assert.deepEqual(users, await repo.list());
      assert.ok(users.some((u) => u.id === user.id && u.active === false));
    },
  },
});

describe("UserRepository (d1) storage", () => {
  it("keeps emails unique whatever their case", async () => {
    const db = createTestD1("ops");
    const repo = d1UserRepository(db);
    await repo.create({ name: "Ada", email: "ada@gwenda.co.uk" });
    await assert.rejects(() =>
      db
        .prepare(
          "INSERT INTO users (name, email) VALUES ('Ada', 'ADA@gwenda.co.uk')",
        )
        .run(),
    );
  });

  it("a new user after an import doesn't reuse an imported id", async () => {
    const repo = d1UserRepository(createTestD1("ops"));
    await repo.importAll({
      users: [{ id: 40, name: "Ada", email: "ada@gwenda.co.uk", active: true }],
    });
    const next = await repo.create({ name: "Bo", email: "bo@gwenda.co.uk" });
    assert.ok(next.id > 40);
  });
});

describe("usersRepository", () => {
  it("stays on Baserow until store:users says d1, then reads D1", async () => {
    const world = await createFakeWorld();
    world.install();
    worlds.push(world);
    const OPS_DB = createTestD1("ops");
    await d1UserRepository(OPS_DB).importAll({
      users: [{ id: 7, name: "On D1", email: "d1@gwenda.co.uk", active: true }],
    });
    const env = { ...world.env, OPS_DB };

    const onBaserow = await usersRepository(env).list();
    assert.deepEqual(
      onBaserow.map((u) => u.email),
      ["editor@gwenda.co.uk"],
    );

    await OPS_DB.prepare(
      "INSERT INTO _meta (key, value) VALUES ('store:users', 'd1')",
    ).run();
    // A new runtime: each one keeps the flag it read for a few seconds.
    const onD1 = await usersRepository({ ...env }).list();
    assert.deepEqual(
      onD1.map((u) => u.email),
      ["d1@gwenda.co.uk"],
    );
  });

  it("uses env.usersRepository when a test hands one in", async () => {
    const repo = memoryUserRepository([
      { id: 1, name: "M", email: "m@gwenda.co.uk" },
    ]);
    assert.equal(usersRepository({ usersRepository: repo }), repo);
  });
});
