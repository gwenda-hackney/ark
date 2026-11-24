/**
 * Owners (#375; admins before roles): from the Owner role on hosted ops,
 * everyone on dev and a developer's machine, and before roles are migrated
 * the old admin list.
 */
import assert from "node:assert/strict";
import { beforeEach, test } from "vitest";
import { createTestD1 } from "../../../../../shared/testing/d1-sqlite.js";
import { memoryUserRepository } from "../../users/server/adapters/memory-users.js";
import { memoryRoleRepository } from "../../users/server/adapters/memory-roles.js";
import { accessFor, emailsWithAccess, parseAdminEmails, resetAccessCacheForTests } from "./access.js";
import { isOpsAdmin } from "./admin.js";

beforeEach(() => resetAccessCacheForTests());

const hosted = (users, roles = memoryRoleRepository()) => ({
  SITE_ENV: "production",
  CONFIG_DB: createTestD1("config"),
  usersRepository: memoryUserRepository(users),
  rolesRepository: roles,
});

test("admin list parses commas, spaces and case", () => {
  assert.deepEqual([...parseAdminEmails(" A@x.com, b@x.com;c@x.com ")], ["a@x.com", "b@x.com", "c@x.com"]);
});

test("an owner is whoever has the Owner role; everyone is on dev and locally", async () => {
  const env = hosted([
    { id: 1, email: "dan@gwenda.co.uk", roleId: 1 },
    { id: 2, email: "play@gwenda.co.uk", roleId: 2 },
  ]);
  assert.equal(await isOpsAdmin(env, "Dan@Gwenda.co.uk"), true);
  assert.equal(await isOpsAdmin(env, "play@gwenda.co.uk"), false);
  assert.equal(await isOpsAdmin(env, ""), false);
  assert.equal(await isOpsAdmin({ SITE_ENV: "local" }, ""), true);
});

test("no role is the default role; extras raise it; someone off the list has nothing", async () => {
  const roles = memoryRoleRepository();
  const bar = await roles.create({ name: "Bar", areas: { stock: "edit", menus: "view" } });
  const env = hosted(
    [
      { id: 1, email: "new@gwenda.co.uk" },
      { id: 2, email: "sam@gwenda.co.uk", roleId: bar.id, extras: { "whats-on": "edit" } },
      { id: 3, email: "gone@gwenda.co.uk", roleId: 1, active: false },
    ],
    roles,
  );
  const fresh = await accessFor(env, "new@gwenda.co.uk");
  assert.deepEqual([fresh.role.name, fresh.levels.email, fresh.levels["email-send"]], ["Manager", "edit", "none"]);
  const sam = await accessFor(env, "sam@gwenda.co.uk");
  assert.deepEqual([sam.role.name, sam.levels.stock, sam.levels.menus, sam.levels["whats-on"], sam.levels.users], ["Bar", "edit", "view", "edit", "none"]);
  const gone = await accessFor(env, "gone@gwenda.co.uk");
  assert.deepEqual([gone.owner, gone.levels.stock], [false, "none"]);
});

test("before roles are migrated, the old admin list makes owners and everyone else a Manager", async () => {
  const broken = { list: async () => { throw new Error("no such table: roles"); } };
  const env = hosted([{ id: 1, email: "dan@gwenda.co.uk" }, { id: 2, email: "play@gwenda.co.uk" }], broken);
  env.CONFIG_DB.exec(`INSERT INTO config_values (name, value, env, service) VALUES ('ops.admin_emails', 'dan@gwenda.co.uk', 'production', 'ops')`);
  assert.equal(await isOpsAdmin(env, "dan@gwenda.co.uk"), true);
  const play = await accessFor(env, "play@gwenda.co.uk");
  assert.deepEqual([play.owner, play.role.name], [false, "Manager"]);
});

test("who to tell about an area follows roles, also on dev", async () => {
  const env = { ...hosted([{ id: 1, email: "dan@gwenda.co.uk", roleId: 1 }, { id: 2, email: "play@gwenda.co.uk" }]), SITE_ENV: "dev" };
  assert.deepEqual(await emailsWithAccess(env, "email-send"), ["dan@gwenda.co.uk"]);
});
