import assert from "node:assert/strict";
import { afterEach, describe, it } from "vitest";
import {
  activeEmailsFrom,
  createOpsUser,
  isOpsUser,
  listOpsUsers,
  resetUsersCacheForTests,
  updateOpsUser,
} from "./user-store.js";
import { createTestD1 } from "../../../../../shared/testing/d1-sqlite.js";
import { d1UserRepository } from "./adapters/d1-users.js";

afterEach(() => {
  resetUsersCacheForTests();
});

/** A dev env whose ops database holds these users. */
async function withUsers(users) {
  const OPS_DB = createTestD1("ops");
  await d1UserRepository(OPS_DB).importAll({ users });
  return { SITE_ENV: "dev", OPS_DB };
}

describe("activeEmailsFrom", () => {
  it("keeps active emails and drops inactive or blank ones", () => {
    const emails = activeEmailsFrom([
      { email: "A@X.com", active: true },
      { email: "skip@x.com", active: false },
      { email: "  b@y.com ", active: true },
      { email: "", active: true },
    ]);
    assert.deepEqual([...emails].sort(), ["a@x.com", "b@y.com"]);
  });
});

describe("isOpsUser", () => {
  it("matches emails whatever their case, and only active users", async () => {
    const env = await withUsers([
      { id: 1, name: "P", email: "person@gwenda.com", active: true },
      { id: 2, name: "G", email: "gone@gwenda.com", active: false },
    ]);
    assert.equal(await isOpsUser(env, " Person@Gwenda.com "), true);
    assert.equal(await isOpsUser(env, "gone@gwenda.com"), false);
    assert.equal(await isOpsUser(env, "other@gwenda.com"), false);
  });

  it("fails closed when the database can't be read", async () => {
    const OPS_DB = {
      prepare() {
        throw new Error("D1 is down");
      },
    };
    await assert.rejects(() => isOpsUser({ SITE_ENV: "dev", OPS_DB }, "person@gwenda.com"), /D1 is down/);
  });

  it("fails closed when there is no database at all", async () => {
    await assert.rejects(() => isOpsUser({ SITE_ENV: "dev" }, "person@gwenda.com"));
  });
});

describe("listOpsUsers / createOpsUser / updateOpsUser", () => {
  it("lists users with emails, sorted", async () => {
    const env = await withUsers([
      { id: 2, name: "B", email: "b@gwenda.com", active: true },
      { id: 1, name: "A", email: "a@gwenda.com", active: false },
    ]);
    const users = await listOpsUsers(env);
    assert.deepEqual(
      users.map((u) => u.email),
      ["a@gwenda.com", "b@gwenda.com"],
    );
    assert.equal(users[0].active, false);
  });

  it("creates a user and rejects duplicates", async () => {
    const env = await withUsers([{ id: 1, name: "A", email: "a@gwenda.com", active: true }]);
    const created = await createOpsUser(env, {
      email: "New@Gwenda.com",
      name: "New",
    });
    assert.equal(created.email, "new@gwenda.com");
    assert.equal(created.name, "New");
    assert.equal(created.active, true);

    await assert.rejects(
      () => createOpsUser(env, { email: "a@gwenda.com" }),
      (error) => error.status === 409,
    );
  });

  it("patches Active without requiring email", async () => {
    const env = await withUsers([{ id: 1, name: "A", email: "a@gwenda.com", active: true }]);
    const user = await updateOpsUser(env, "1", { active: false });
    assert.equal(user.active, false);
    assert.equal(user.email, "a@gwenda.com");
  });
});
