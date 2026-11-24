/**
 * migrations/2026-11-24-owners.mjs (#375): the two owners get the Owner role
 * on the real ops schema; running it again changes nothing; someone not on
 * the users list is said, not added; everyone else keeps no role (Manager).
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { createTestD1 } from "../../shared/testing/d1-sqlite.js";
import { d1UserRepository } from "../../ops/site/src/users/server/adapters/d1-users.js";
import { OWNER_ROLE_ID } from "../../ops/site/src/users/server/role-repository.js";
import { makeOwners } from "../../migrations/2026-11-24-owners.mjs";

describe("owners migration", () => {
  it("makes dscalamogna@ and lfersini@ owners, once, and leaves everyone else", async () => {
    const users = d1UserRepository(createTestD1("ops"));
    await users.create({ email: "dscalamogna@gwenda.co.uk" });
    await users.create({ email: "lfersini@gwenda.co.uk" });
    await users.create({ email: "staff@gwenda.co.uk" });
    const lines = [];
    assert.equal(await makeOwners(users, (line) => lines.push(line)), 2);
    const roles = Object.fromEntries((await users.list()).map((user) => [user.email, user.roleId]));
    assert.deepEqual(roles, {
      "dscalamogna@gwenda.co.uk": OWNER_ROLE_ID,
      "lfersini@gwenda.co.uk": OWNER_ROLE_ID,
      "staff@gwenda.co.uk": null,
    });
    assert.equal(await makeOwners(users, () => {}), 0, "running it again changes nothing");
  });

  it("says, and doesn't add, an owner missing from the users list", async () => {
    const users = d1UserRepository(createTestD1("ops"));
    await users.create({ email: "dscalamogna@gwenda.co.uk" });
    const lines = [];
    assert.equal(await makeOwners(users, (line) => lines.push(line)), 1);
    assert.ok(lines.some((line) => line.startsWith("lfersini@gwenda.co.uk isn't on the ops users list")));
    assert.equal((await users.list()).length, 1);
  });
});
