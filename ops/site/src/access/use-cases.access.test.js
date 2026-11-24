/**
 * Use cases (#375): what a person can do in ops follows their role, checked
 * on every API request by the middleware, on production ops with the real
 * ops database (SQLite with the migrations: Owner and Marketing made).
 */
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "vitest";
import { protect as middleware } from "../../functions/_middleware.js";
import { onRequestGet as getMe } from "../../functions/api/auth/me.js";
import { signedIn } from "../email/testing.js";
import { createFakeWorld } from "../testing/fake-world.js";
import { resetUsersCacheForTests } from "../users/server/user-store.js";
import { d1RoleRepository } from "../users/server/adapters/d1-roles.js";
import { d1UserRepository } from "../users/server/adapters/d1-users.js";

let world;

beforeEach(async () => {
  resetUsersCacheForTests();
  world = await createFakeWorld();
  world.install();
  world.env.SITE_ENV = "production";
});

afterEach(() => world.restore());

/** A request through the middleware as `email`; the handler behind it just says "ok". */
async function as(email, method, path) {
  const request = new Request(`https://ops.example${path}`, { method, headers: await signedIn(world, email) });
  return middleware({ request, env: world.env, data: { opsEnv: world.env }, next: async () => new Response("ok") });
}

async function staff() {
  const roles = d1RoleRepository(world.env.OPS_DB);
  const users = d1UserRepository(world.env.OPS_DB);
  const bar = await roles.create({ name: "Bar", areas: { stock: "edit", menus: "view" } });
  await users.create({ email: "sam@gwenda.co.uk", roleId: bar.id });
  await users.create({ email: "newbie@gwenda.co.uk" });
  world.makeOwner("dan@gwenda.co.uk");
}

describe("access by area", () => {
  it("Bar staff change stock, look at menus but can't change them, and can't touch events", async () => {
    await staff();
    assert.equal((await as("sam@gwenda.co.uk", "PATCH", "/api/inventory/3")).status, 200);
    assert.equal((await as("sam@gwenda.co.uk", "GET", "/api/menus")).status, 200);
    const menu = await as("sam@gwenda.co.uk", "PATCH", "/api/menus/3");
    assert.equal(menu.status, 403);
    assert.equal((await menu.json()).error, "You can view Menus and items but not change it. Ask an owner.");
    assert.equal((await as("sam@gwenda.co.uk", "POST", "/api/events")).status, 403);
  });

  it("guarded areas refuse even a look: users, guests' addresses, developer tools", async () => {
    await staff();
    for (const path of ["/api/users", "/api/email/people", "/api/web/databases"]) {
      assert.equal((await as("sam@gwenda.co.uk", "GET", path)).status, 403, path);
    }
  });

  it("someone with no role has the default role, Marketing", async () => {
    await staff();
    assert.equal((await as("newbie@gwenda.co.uk", "POST", "/api/events")).status, 200);
    assert.equal((await as("newbie@gwenda.co.uk", "POST", "/api/email/one-off/4/send")).status, 200);
    assert.equal((await as("newbie@gwenda.co.uk", "PATCH", "/api/menus/3")).status, 403);
    assert.equal((await as("newbie@gwenda.co.uk", "POST", "/api/users")).status, 403);
  });

  it("an owner does everything", async () => {
    await staff();
    for (const [method, path] of [["POST", "/api/email/one-off/4/send"], ["GET", "/api/email/people"], ["POST", "/api/web/dev-copy"], ["DELETE", "/api/users/2"]]) {
      assert.equal((await as("dan@gwenda.co.uk", method, path)).status, 200, path);
    }
  });
});

describe("the Marketing role", () => {
  it("changes all of What's on, sends email and puts the website live; looks at the rest", async () => {
    const users = d1UserRepository(world.env.OPS_DB);
    await users.create({ email: "mo@gwenda.co.uk", roleId: 3 });
    for (const [method, path] of [
      ["POST", "/api/events"],
      ["PATCH", "/api/occasions/1"],
      ["POST", "/api/forms/1/decision"],
      ["POST", "/api/email/one-off/4/send"],
      ["POST", "/api/venue/gallery"],
      ["POST", "/api/web/update"],
    ]) {
      assert.equal((await as("mo@gwenda.co.uk", method, path)).status, 200, path);
    }
    assert.equal((await as("mo@gwenda.co.uk", "GET", "/api/menus")).status, 200);
    assert.equal((await as("mo@gwenda.co.uk", "PATCH", "/api/menus/3")).status, 403);
    assert.equal((await as("mo@gwenda.co.uk", "GET", "/api/email/people")).status, 403);
    assert.equal((await as("mo@gwenda.co.uk", "GET", "/api/users")).status, 403);
  });
});

describe("view as a role (dev and local only)", () => {
  /** A request as an owner, with the view-as cookie for `roleId`. */
  async function viewing(roleId, method, path) {
    const headers = new Headers(await signedIn(world, "dan@gwenda.co.uk"));
    headers.set("Cookie", [headers.get("Cookie"), `ops_view_as=${roleId}`].filter(Boolean).join("; "));
    const request = new Request(`https://ops.example${path}`, { method, headers });
    return { request, res: await middleware({ request, env: world.env, data: { opsEnv: world.env }, next: async () => new Response("ok") }) };
  }

  it("on dev an owner viewing as Marketing gets Marketing's refusals, and /me says so; Owner is back to everything", async () => {
    world.env.SITE_ENV = "dev";
    await staff();
    assert.equal((await viewing(3, "POST", "/api/events")).res.status, 200, "Marketing changes What's on");
    assert.equal((await viewing(3, "PATCH", "/api/menus/3")).res.status, 403, "Marketing has no Menus");
    assert.equal((await viewing(1, "PATCH", "/api/menus/3")).res.status, 200, "viewing as Owner is themselves");

    const { request } = await viewing(3, "GET", "/api/auth/me");
    const me = await (await getMe({ request, env: world.env, data: { opsEnv: world.env } })).json();
    assert.deepEqual([me.access.owner, me.access.role.name, me.access.viewingAs, me.access.levels.menus], [false, "Marketing", true, "none"]);
    assert.deepEqual(me.viewAs.map((role) => role.name).slice(0, 2), ["Owner", "Marketing"]);
  });

  it("production ignores the cookie, and offers no view as", async () => {
    await staff();
    assert.equal((await viewing(3, "PATCH", "/api/menus/3")).res.status, 200, "still the owner");
    const { request } = await viewing(3, "GET", "/api/auth/me");
    const me = await (await getMe({ request, env: world.env, data: { opsEnv: world.env } })).json();
    assert.deepEqual([me.access.owner, me.viewAs], [true, null]);
  });
});
