/**
 * Who can do what (#375): a signed-in person's level on every area, from
 * their role (users module's roles).
 * The middleware refuses what their levels don't allow (areas.js
 * refusalFor); /api/auth/me tells the app, for its menu and buttons.
 *
 * Owners have everything. On dev and a developer's machine everyone is an
 * owner, as everyone was an admin there before roles. A person with no role
 * has the default role (Marketing). There an owner can look at ops as a role
 * sees it ("view as", the ops_view_as cookie, viewAsFrom): their levels are
 * that role's until they switch back; production ignores it. Before the roles migration has run (a
 * local database, a deploy that skipped it) the old rule holds: admins
 * (config ops.admin_emails) are owners and everyone else has the default role.
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
export async function accessFor(env, email, { viewAs = null } = {}) {
  if (siteEnvName(env) === "dev") {
    const viewing = viewAs == null ? null : await viewingAs(env, viewAs);
    return viewing || ownerOf({ id: DEFAULT_ROLES[0].id, name: DEFAULT_ROLES[0].name });
  }
  return accessByRole(env, email);
}

/** The cookie an owner on dev sets to look at ops as a role sees it. */
export const VIEW_AS_COOKIE = "ops_view_as";

/** The role id a request asks to view as, or null. */
export function viewAsFrom(request) {
  const cookies = String(request?.headers?.get("Cookie") || "");
  const match = cookies.match(new RegExp(`(?:^|;\\s*)${VIEW_AS_COOKIE}=(\\d+)`));
  return match ? Number(match[1]) : null;
}

/** On dev: the access of a role that isn't Owner, marked as viewing as it; null for any other. */
async function viewingAs(env, roleId) {
  const { roles } = await usersAndRoles(env);
  const role = roles?.find((candidate) => candidate.id === Number(roleId));
  if (!role || role.owner) return null;
  return { owner: false, role: { id: role.id, name: role.name }, levels: levelsFor(role), viewingAs: true };
}

/** The roles an owner on dev can view ops as: every one, Owner first (Owner = back to themselves). */
export async function viewAsChoices(env) {
  if (siteEnvName(env) !== "dev") return null;
  const { roles } = await usersAndRoles(env);
  return (roles || []).map((role) => ({ id: role.id, name: role.name, owner: Boolean(role.owner) }));
}

const ownerOf = (role) => ({ owner: true, role, levels: levelsFor({ owner: true }) });

/** Access from their role alone, on any environment (dev's everyone-is-an-owner left out). */
async function accessByRole(env, email) {
  const address = normalizeEmail(email);
  const { users, roles } = await usersAndRoles(env);
  const user = users.find((candidate) => candidate.email === address && candidate.active) || null;
  if (!roles) {
    // Roles not migrated here yet: admins are owners, everyone else the default role.
    const admins = parseAdminEmails(await getConfigString(env, ADMIN_EMAILS_KEY).catch(() => ""));
    if (address && admins.has(address)) return ownerOf({ id: DEFAULT_ROLES[0].id, name: DEFAULT_ROLES[0].name });
    const fallback = DEFAULT_ROLES.find((candidate) => candidate.isDefault);
    return { owner: false, role: { id: fallback.id, name: fallback.name }, levels: levelsFor(fallback) };
  }
  if (!user) return { owner: false, role: null, levels: levelsFor(null) };
  const role = roles.find((candidate) => candidate.id === user.roleId) || roles.find((candidate) => candidate.isDefault) || null;
  if (role?.owner) return ownerOf({ id: role.id, name: role.name });
  return {
    owner: false,
    role: role ? { id: role.id, name: role.name } : null,
    levels: levelsFor(role),
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

/** The access of the person making a request (their session's email). */
export async function requestAccess(context) {
  const { resolveAuth, resolveSessionEmail } = await import("./auth.js");
  const email = await resolveSessionEmail(context.request, resolveAuth(context.env)).catch(() => "");
  return { email, ...(await accessFor(context.env, email, { viewAs: viewAsFrom(context.request) })) };
}
