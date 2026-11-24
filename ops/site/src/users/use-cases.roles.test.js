/**
 * Use cases (#375): roles and who has which, through the real API handlers
 * on production ops with the real ops database (SQLite with the migrations:
 * Owner, Manager and Marketing made).
 */
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "vitest";
import { onRequestGet as listRoles, onRequestPost as addRole } from "../../functions/api/roles/index.js";
import { onRequestDelete as removeRole, onRequestPatch as changeRole } from "../../functions/api/roles/[id].js";
import { onRequestDelete as removeUser, onRequestPatch as changeUser } from "../../functions/api/users/[id].js";
import { onRequestPost as addUser } from "../../functions/api/users/index.js";
import { signedIn } from "../email/testing.js";
import { callApi, createFakeWorld } from "../testing/fake-world.js";
import { d1UserRepository } from "./server/adapters/d1-users.js";
import { resetUsersCacheForTests } from "./server/user-store.js";

const OWNER = "dan@gwenda.co.uk";
const STAFF = "sam@gwenda.co.uk";

let world;
let users;

beforeEach(async () => {
  resetUsersCacheForTests();
  world = await createFakeWorld();
  world.install();
  world.env.SITE_ENV = "production";
  users = d1UserRepository(world.env.OPS_DB);
  await users.create({ email: STAFF });
  world.makeOwner(OWNER);
});

afterEach(() => world.restore());

async function as(email, handler, { method = "GET", path, params, body } = {}) {
  return callApi(world, handler, { method, path, params, body, headers: await signedIn(world, email) });
}
const idOf = async (email) => (await users.list()).find((user) => user.email === email).id;

describe("roles", () => {
  it("lists every role with how many have it: no role counts as the default", async () => {
    const { status, data } = await as(OWNER, listRoles, { path: "/api/roles" });
    assert.equal(status, 200);
    const people = Object.fromEntries(data.roles.map((role) => [role.name, role.people]));
    assert.deepEqual(people, { Owner: 1, Manager: 2, Marketing: 0 }, "Sam, and the world's own editor, have no role: Manager");
  });

  it("an owner adds a role and changes it; anyone else is refused", async () => {
    const added = await as(OWNER, addRole, { method: "POST", path: "/api/roles", body: { name: "Bar", areas: { stock: "edit", menus: "view" } } });
    assert.equal(added.status, 201, JSON.stringify(added.data));
    const id = added.data.role.id;
    const changed = await as(OWNER, changeRole, { method: "PATCH", path: `/api/roles/${id}`, params: { id: String(id) }, body: { areas: { stock: "edit", menus: "edit" } } });
    assert.deepEqual(changed.data.role.areas, { stock: "edit", menus: "edit" });

    const refused = await as(STAFF, addRole, { method: "POST", path: "/api/roles", body: { name: "Mine" } });
    assert.equal(refused.status, 403);
    assert.match(refused.data.error, /Only owners/);
  });

  it("the Owner role can't be changed or removed, nor the default; names are unique", async () => {
    assert.equal((await as(OWNER, changeRole, { method: "PATCH", path: "/api/roles/1", params: { id: "1" }, body: { areas: {} } })).status, 400);
    assert.equal((await as(OWNER, removeRole, { method: "DELETE", path: "/api/roles/1", params: { id: "1" } })).status, 400);
    assert.equal((await as(OWNER, removeRole, { method: "DELETE", path: "/api/roles/2", params: { id: "2" } })).status, 400);
    const twin = await as(OWNER, addRole, { method: "POST", path: "/api/roles", body: { name: "marketing" } });
    assert.equal(twin.status, 409);
  });

  it("removing a role gives its people the default role", async () => {
    const sam = await idOf(STAFF);
    await as(OWNER, changeUser, { method: "PATCH", path: `/api/users/${sam}`, params: { id: String(sam) }, body: { roleId: 3 } });
    assert.equal((await users.get(sam)).roleId, 3);
    assert.equal((await as(OWNER, removeRole, { method: "DELETE", path: "/api/roles/3", params: { id: "3" } })).status, 200);
    assert.equal((await users.get(sam)).roleId, null);
  });
});

describe("a person's role", () => {
  it("an owner adds someone with a role; no one else can give a role when adding", async () => {
    const added = await as(OWNER, addUser, { method: "POST", path: "/api/users", body: { email: "new@gwenda.co.uk", active: true, roleId: 3 } });
    assert.equal(added.status, 201, JSON.stringify(added.data));
    assert.equal(added.data.user.roleId, 3);
    assert.equal((await users.get(added.data.user.id)).roleId, 3, "Marketing, saved");

    const refused = await as(STAFF, addUser, { method: "POST", path: "/api/users", body: { email: "other@gwenda.co.uk", roleId: 1 } });
    assert.equal(refused.status, 403);
    assert.ok(!(await users.list()).some((user) => user.email === "other@gwenda.co.uk"), "nobody added");
  });

  it("an owner gives someone a role and extras; they can't give themselves one", async () => {
    const sam = await idOf(STAFF);
    const given = await as(OWNER, changeUser, {
      method: "PATCH",
      path: `/api/users/${sam}`,
      params: { id: String(sam) },
      body: { roleId: 3, extras: { menus: "edit", stock: "none" } },
    });
    assert.equal(given.status, 200, JSON.stringify(given.data));
    assert.deepEqual([given.data.user.roleId, given.data.user.extras], [3, { menus: "edit" }]);

    const selfPromotion = await as(STAFF, changeUser, { method: "PATCH", path: `/api/users/${sam}`, params: { id: String(sam) }, body: { roleId: 1 } });
    assert.equal(selfPromotion.status, 403);
  });

  it("there's always an owner: the last one can't be demoted, switched off or removed", async () => {
    const dan = await idOf(OWNER);
    const at = { path: `/api/users/${dan}`, params: { id: String(dan) } };
    for (const body of [{ roleId: 2 }, { active: false }]) {
      const res = await as(OWNER, changeUser, { method: "PATCH", ...at, body });
      assert.equal(res.status, 400, JSON.stringify(body));
      assert.match(res.data.error, /last owner/);
    }
    assert.equal((await as(OWNER, removeUser, { method: "DELETE", ...at })).status, 400);

    // With a second owner, the first can step down.
    const sam = await idOf(STAFF);
    await as(OWNER, changeUser, { method: "PATCH", path: `/api/users/${sam}`, params: { id: String(sam) }, body: { roleId: 1 } });
    assert.equal((await as(OWNER, changeUser, { method: "PATCH", ...at, body: { roleId: 2 } })).status, 200);
  });
});
