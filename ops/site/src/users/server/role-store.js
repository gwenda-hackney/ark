/**
 * Roles and who has which (#375), the rules on top of the repositories:
 *
 *   - only owners change roles, or give someone a role
 *   - the Owner role has everything: its areas can't be changed, and it
 *     can't be renamed or removed; nor can the default role (Marketing), which
 *     everyone without a role has
 *   - there is always an active owner: the last one can't lose the role, be
 *     switched off or be removed
 *   - removing a role gives its people the default role
 *   - role names are unique, whatever their case
 */
import { areaLevels, normalizeEmail, text } from "./user-model.js";
import { roleNotFound } from "./role-model.js";
import { rolesRepository } from "./role-repository.js";
import { usersRepository } from "./user-repository.js";
import { bustAccessCache } from "../../access/server/access.js";

function refuse(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

/** Throws 403 unless the person acting is an owner. */
export function requireOwner(actor) {
  if (!actor?.owner) throw refuse(403, "Only owners can change roles. Ask an owner.");
}

/** A role as the API returns it, with how many people have it. */
function roleView(role, users) {
  const holders = users.filter((user) => (user.roleId ?? null) === role.id || (role.isDefault && user.roleId == null));
  return { ...role, people: holders.length };
}

export async function listRoles(env) {
  const [roles, users] = await Promise.all([rolesRepository(env).list(), usersRepository(env).list()]);
  return roles.map((role) => roleView(role, users));
}

async function nameFree(env, name, exceptId) {
  const clash = (await rolesRepository(env).list()).find(
    (role) => role.name.toLowerCase() === name.toLowerCase() && role.id !== Number(exceptId),
  );
  if (clash) throw refuse(409, `There's a role called ${clash.name} already.`);
}

export async function createRole(env, actor, input = {}) {
  requireOwner(actor);
  const name = text(input.name);
  if (!name) throw refuse(400, "Give the role a name.");
  await nameFree(env, name);
  const role = await rolesRepository(env).create({ name, areas: areaLevels(input.areas) });
  bustAccessCache();
  return role;
}

export async function updateRole(env, actor, id, input = {}) {
  requireOwner(actor);
  const repo = rolesRepository(env);
  const current = await repo.get(id);
  if (!current) throw roleNotFound();
  if (current.owner) throw refuse(400, "The Owner role has everything: it can't be changed.");
  const fields = {};
  if (input.name !== undefined) {
    const name = text(input.name);
    if (!name) throw refuse(400, "Give the role a name.");
    await nameFree(env, name, current.id);
    fields.name = name;
  }
  if (input.areas !== undefined) fields.areas = areaLevels(input.areas);
  const role = await repo.update(current.id, fields);
  bustAccessCache();
  return role;
}

export async function deleteRole(env, actor, id) {
  requireOwner(actor);
  const repo = rolesRepository(env);
  const current = await repo.get(id);
  if (!current) return;
  if (current.owner) throw refuse(400, "The Owner role can't be removed.");
  if (current.isDefault) throw refuse(400, `${current.name} is everyone's role until they're given another: it can't be removed.`);
  const users = usersRepository(env);
  for (const user of await users.list()) {
    if (user.roleId === current.id) await users.update(user.id, { roleId: null });
  }
  await repo.remove(current.id);
  bustAccessCache();
}

/** The active users with the Owner role, besides `exceptId`. */
async function otherOwners(env, exceptId) {
  const roles = await rolesRepository(env).list();
  const ownerIds = new Set(roles.filter((role) => role.owner).map((role) => role.id));
  return (await usersRepository(env).list()).filter(
    (user) => user.active && ownerIds.has(user.roleId) && String(user.id) !== String(exceptId),
  );
}

/** Whether a user has the Owner role now. */
async function isOwnerUser(env, user) {
  if (!user?.roleId) return false;
  const role = await rolesRepository(env).get(user.roleId);
  return Boolean(role?.owner);
}

/**
 * Checks a change to who someone is (role, switched off, removed) against
 * the rules, and returns the role field to save. What they can do is their
 * role's alone: there's nothing to give one person above it.
 * @param {{ roleId?: unknown, active?: boolean, removing?: boolean }} change
 */
export async function checkUserAccessChange(env, actor, id, change) {
  const fields = {};
  if (change.roleId !== undefined) requireOwner(actor);
  const current = id == null ? null : await usersRepository(env).get(id);

  if (change.roleId !== undefined) {
    const roleId = change.roleId === null || change.roleId === "" ? null : Number(change.roleId);
    if (roleId !== null && !(await rolesRepository(env).get(roleId))) throw refuse(400, "That role doesn't exist.");
    fields.roleId = roleId;
  }

  if (current && (await isOwnerUser(env, current))) {
    const losesOwner =
      change.removing ||
      change.active === false ||
      (fields.roleId !== undefined && !(fields.roleId !== null && (await rolesRepository(env).get(fields.roleId))?.owner));
    if (losesOwner && !(await otherOwners(env, current.id)).length) {
      throw refuse(400, `${normalizeEmail(current.email)} is the last owner: make someone else an owner first.`);
    }
  }
  return fields;
}
