/**
 * Ops membership: Baserow Users (Email, Name, Active).
 * Cloudflare Access authenticates Google; this table decides who may use the app.
 */
import {
  createRow,
  deleteRow,
  getRow,
  listAllRows,
  resolveOpsTableIds,
  updateRow,
} from "../../platform/baserow.js";

const CACHE_TTL_MS = 30_000;
let cache = { key: "", at: 0, emails: null };

export function resetUsersCacheForTests() {
  cache = { key: "", at: 0, emails: null };
}

function bustUsersCache() {
  cache = { key: "", at: 0, emails: null };
}

export function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function text(value) {
  if (typeof value !== "string") return "";
  return value.trim();
}

function requireUsersTable(tables) {
  if (!tables.users) {
    const error = new Error(
      'Baserow table "Users" not found. Run npm run setup:baserow-ops.',
    );
    error.status = 503;
    throw error;
  }
  return tables.users;
}

export function mapOpsUser(row) {
  return {
    _id: String(row.id),
    id: String(row.id),
    email: normalizeEmail(row.Email),
    name: text(row.Name) || undefined,
    active: row.Active == null ? true : Boolean(row.Active),
  };
}

export function activeEmailsFromRows(rows) {
  const emails = new Set();
  for (const row of rows || []) {
    if (row?.Active === false) continue;
    const email = normalizeEmail(row?.Email);
    if (email) emails.add(email);
  }
  return emails;
}

export async function listActiveOpsEmails(env) {
  const tableId = requireUsersTable(await resolveOpsTableIds(env));
  if (cache.emails && cache.key === tableId && Date.now() - cache.at < CACHE_TTL_MS) {
    return cache.emails;
  }
  const rows = await listAllRows(env, tableId);
  const emails = activeEmailsFromRows(rows);
  cache = { key: tableId, at: Date.now(), emails };
  return emails;
}

export async function isOpsUser(env, email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;
  const emails = await listActiveOpsEmails(env);
  return emails.has(normalized);
}

export async function listOpsUsers(env) {
  const tableId = requireUsersTable(await resolveOpsTableIds(env));
  const rows = await listAllRows(env, tableId);
  return rows
    .map(mapOpsUser)
    .filter((user) => user.email)
    .sort((a, b) => a.email.localeCompare(b.email));
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
    fields.Email = email;
  }
  if (!partial || input.name !== undefined) {
    const name = text(input.name);
    fields.Name = name || fields.Email || text(input.email) || "";
  }
  if (!partial || input.active !== undefined) {
    fields.Active =
      input.active == null
        ? true
        : input.active === true || input.active === "true";
  }
  return fields;
}

export async function createOpsUser(env, input) {
  const tableId = requireUsersTable(await resolveOpsTableIds(env));
  const fields = fieldsFromInput(input || {});
  if (!fields.Name) fields.Name = fields.Email;
  const siblings = await listAllRows(env, tableId);
  const clash = siblings.find(
    (row) => normalizeEmail(row.Email) === fields.Email,
  );
  if (clash) {
    const error = new Error("That email is already on the users list.");
    error.status = 409;
    throw error;
  }
  const row = await createRow(env, tableId, fields);
  bustUsersCache();
  return mapOpsUser(row);
}

export async function updateOpsUser(env, id, input) {
  const tableId = requireUsersTable(await resolveOpsTableIds(env));
  const rowId = String(id || "").trim();
  if (!rowId) {
    const error = new Error("Missing id.");
    error.status = 400;
    throw error;
  }
  const fields = fieldsFromInput(input || {}, { partial: true });
  if (fields.Email) {
    const siblings = await listAllRows(env, tableId);
    const clash = siblings.find(
      (row) =>
        String(row.id) !== rowId && normalizeEmail(row.Email) === fields.Email,
    );
    if (clash) {
      const error = new Error("That email is already on the users list.");
      error.status = 409;
      throw error;
    }
    if (fields.Name === undefined) {
      const current = await getRow(env, tableId, rowId);
      if (!text(current?.Name)) fields.Name = fields.Email;
    }
  }
  const row = await updateRow(env, tableId, rowId, fields);
  bustUsersCache();
  return mapOpsUser(row);
}

export async function deleteOpsUser(env, id) {
  const tableId = requireUsersTable(await resolveOpsTableIds(env));
  const rowId = String(id || "").trim();
  if (!rowId) {
    const error = new Error("Missing id.");
    error.status = 400;
    throw error;
  }
  await deleteRow(env, tableId, rowId);
  bustUsersCache();
}
