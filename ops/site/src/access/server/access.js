/**
 * Who can do what (#375): a signed-in person's level on every area, from
 * their role (users module's roles) and the extras given to them alone.
 * The middleware refuses what their levels don't allow (areas.js
 * refusalFor); /api/auth/me tells the app, for its menu and buttons.
 *
 * Owners have everything. On dev and a developer's machine everyone is an
 * owner, as everyone was an admin there before roles. A person with no role
 * has the default role (Manager). Before the roles migration has run (a
 * local database, a deploy that skipped it) the old rule holds: admins
 * (config ops.admin_emails) are owners and everyone else a Manager.
 */
import { levelsFor } from "../areas.js";
import { getConfigString, siteEnvName } from "../../platform/config-store.js";
import { normalizeEmail } from "../../users/server/user-model.js";
import { usersRepository } from "../../users/server/user-repository.js";
import { DEFAULT_ROLES, rolesRepository } from "../../users/server/role-repository.js";

/** Before roles: who sees developer tools and sends to the list. */
export const ADMIN_EMAILS_KEY = "ops.admin_emails";

export function parseAdminEmails(value) {
  return new Set(
    String(value || "")
      .split(/[\s,;]+/)
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

const CACHE_TTL_MS = 30_000;
let cache = { at: 0, users: null, roles: null };

export function resetAccessCacheForTests() {
  cache = { at: 0, users: null, roles: null };
}

/** After a change to users or roles: the next request reads them again. */
export function bustAccessCache() {
  cache = { at: 0, users: null, roles: null };
}

async function usersAndRoles(env) {
  if (cache.users && Date.now() - cache.at < CACHE_TTL_MS) return cache;
  const [users, roles] = await Promise.all([
    usersRepository(env).list(),
    rolesRepository(env)
      .list()
      .catch(() => null),
  ]);
  cache = { at: Date.now(), users, roles };
  return cache;
}

/**
 * One person's access: { owner, role: { id, name } | null, levels }.
 * `levels` has every area (areas.js levelsFor).
 */
export async function accessFor(env, email) {
  if (siteEnvName(env) === "dev") return ownerOf({ id: DEFAULT_ROLES[0].id, name: DEFAULT_ROLES[0].name });
  return accessByRole(env, email);
}

const ownerOf = (role) => ({ owner: true, role, levels: levelsFor({ owner: true }) });

/** Access from their role alone, on any environment (dev's everyone-is-an-owner left out). */
async function accessByRole(env, email) {
  const address = normalizeEmail(email);
  const { users, roles } = await usersAndRoles(env);
  const user = users.find((candidate) => candidate.email === address && candidate.active) || null;
  if (!roles) {
    // Roles not migrated here yet: admins are owners, everyone else a Manager.
    const admins = parseAdminEmails(await getConfigString(env, ADMIN_EMAILS_KEY).catch(() => ""));
    if (address && admins.has(address)) return ownerOf({ id: DEFAULT_ROLES[0].id, name: DEFAULT_ROLES[0].name });
    const manager = DEFAULT_ROLES[1];
    return { owner: false, role: { id: manager.id, name: manager.name }, levels: levelsFor(manager) };
  }
  if (!user) return { owner: false, role: null, levels: levelsFor(null) };
  const role = roles.find((candidate) => candidate.id === user.roleId) || roles.find((candidate) => candidate.isDefault) || null;
  if (role?.owner) return ownerOf({ id: role.id, name: role.name });
  return {
    owner: false,
    role: role ? { id: role.id, name: role.name } : null,
    levels: levelsFor(role, user.extras),
  };
}

/** The active users who have at least `need` on an area: who to tell about it. */
export async function emailsWithAccess(env, area, need = "edit") {
  const { users } = await usersAndRoles(env);
  const out = [];
  for (const user of users) {
    if (!user.active || !user.email) continue;
    const { levels } = await accessByRole(env, user.email);
    if (need === "view" ? levels[area] !== "none" : levels[area] === "edit") out.push(user.email);
  }
  return out;
}

/** Throws 403 with the reason unless the request's person has `need` on `area`. */
export async function requireArea(env, email, area, need = "edit") {
  const { levels } = await accessFor(env, email);
  const have = levels[area];
  if (have === "edit" || (need === "view" && have === "view")) return;
  const error = new Error("You don't have access to that. Ask an owner.");
  error.status = 403;
  throw error;
}
