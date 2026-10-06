/**
 * Ops membership: who may use the app (UserRepository: Baserow Users, then D1).
 * Google OAuth authenticates; this list decides who gets in.
 */
import { normalizeEmail, text } from "./user-model.js";
import { usersRepository } from "./user-repository.js";

export { normalizeEmail };

const CACHE_TTL_MS = 30_000;
let cache = { at: 0, emails: null };

export function resetUsersCacheForTests() {
  cache = { at: 0, emails: null };
}

function bustUsersCache() {
  cache = { at: 0, emails: null };
}

/** A user as the API returns it. */
export function mapOpsUser(user) {
  return {
    _id: String(user.id),
    id: String(user.id),
    email: user.email,
    name: user.name || undefined,
    active: user.active,
  };
}

export function activeEmailsFrom(users) {
  const emails = new Set();
  for (const user of users || []) {
    if (!user?.active) continue;
    const email = normalizeEmail(user.email);
    if (email) emails.add(email);
  }
  return emails;
}

export async function listActiveOpsEmails(env) {
  if (cache.emails && Date.now() - cache.at < CACHE_TTL_MS) {
    return cache.emails;
  }
  const emails = activeEmailsFrom(await usersRepository(env).list());
  cache = { at: Date.now(), emails };
  return emails;
}

export async function isOpsUser(env, email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;
  const emails = await listActiveOpsEmails(env);
  return emails.has(normalized);
}

export async function listOpsUsers(env) {
  const users = await usersRepository(env).list();
  return users
    .filter((user) => user.email)
    .sort((a, b) => a.email.localeCompare(b.email))
    .map(mapOpsUser);
}

function fieldsFromInput(input, { partial = false } = {}) {
  const fields = {};
  if (!partial || input.email !== undefined) {
    const email = normalizeEmail(input.email);
    if (!email || !email.includes("@")) {
      const error = new Error("Enter a valid email address.");
      error.status = 400;
      throw error;
    }
    fields.email = email;
  }
  if (!partial || input.name !== undefined) {
    const name = text(input.name);
    fields.name = name || fields.email || text(input.email) || "";
  }
  if (!partial || input.active !== undefined) {
    fields.active =
      input.active == null
        ? true
        : input.active === true || input.active === "true";
  }
  return fields;
}

function emailTaken() {
  const error = new Error("That email is already on the users list.");
  error.status = 409;
  return error;
}

export async function createOpsUser(env, input) {
  const repo = usersRepository(env);
  const fields = fieldsFromInput(input || {});
  if (!fields.name) fields.name = fields.email;
  const siblings = await repo.list();
  if (siblings.some((user) => user.email === fields.email)) throw emailTaken();
  const user = await repo.create(fields);
  bustUsersCache();
  return mapOpsUser(user);
}

export async function updateOpsUser(env, id, input) {
  const repo = usersRepository(env);
  const rowId = String(id || "").trim();
  if (!rowId) {
    const error = new Error("Missing id.");
    error.status = 400;
    throw error;
  }
  const fields = fieldsFromInput(input || {}, { partial: true });
  if (fields.email) {
    const siblings = await repo.list();
    const clash = siblings.find(
      (user) => String(user.id) !== rowId && user.email === fields.email,
    );
    if (clash) throw emailTaken();
    if (fields.name === undefined) {
      const current = await repo.get(rowId);
      if (!current?.name) fields.name = fields.email;
    }
  }
  const user = await repo.update(rowId, fields);
  bustUsersCache();
  return mapOpsUser(user);
}

export async function deleteOpsUser(env, id) {
  const rowId = String(id || "").trim();
  if (!rowId) {
    const error = new Error("Missing id.");
    error.status = 400;
    throw error;
  }
  await usersRepository(env).remove(rowId);
  bustUsersCache();
}
