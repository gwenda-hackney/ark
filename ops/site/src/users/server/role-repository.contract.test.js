/**
 * What every RoleRepository adapter must do (#375): the same cases on memory
 * and D1 (SQLite with the real migrations), so the migration's Owner and
 * Manager are the ones the code expects.
 */
import assert from "node:assert/strict";
import { createTestD1 } from "../../../../../shared/testing/d1-sqlite.js";
import { repositoryContract } from "../../../../../shared/testing/repository-contract.js";
import { d1RoleRepository } from "./adapters/d1-roles.js";
import { memoryRoleRepository } from "./adapters/memory-roles.js";
import { DEFAULT_ROLES } from "./role-repository.js";

repositoryContract("RoleRepository", {
  adapters: {
    memory: () => memoryRoleRepository(),
    d1: () => d1RoleRepository(createTestD1("ops")),
  },
  cases: {
    "starts with Owner and Manager, as the migration makes them": async (repo) => {
      assert.deepEqual(await repo.list(), DEFAULT_ROLES);
    },
    "a role's levels round-trip; unknown areas and levels are dropped": async (repo) => {
      const bar = await repo.create({ name: " Bar ", areas: { stock: "edit", menus: "view", ghosts: "edit", users: "admin" } });
      assert.deepEqual(await repo.get(bar.id), { id: bar.id, name: "Bar", owner: false, isDefault: false, areas: { stock: "edit", menus: "view" } });
    },
    "update changes only what's given; a missing role is a 404": async (repo) => {
      const bar = await repo.create({ name: "Bar", areas: { stock: "edit" } });
      assert.deepEqual((await repo.update(bar.id, { name: "Bar staff" })).areas, { stock: "edit" });
      assert.deepEqual((await repo.update(bar.id, { areas: { stock: "view" } })).name, "Bar staff");
      await assert.rejects(repo.update(987_654, { name: "x" }), (error) => error.status === 404);
    },
    "remove takes it away": async (repo) => {
      const bar = await repo.create({ name: "Bar" });
      await repo.remove(bar.id);
      assert.equal(await repo.get(bar.id), null);
      assert.equal((await repo.list()).length, 2);
    },
  },
});
