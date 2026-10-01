/**
 * Runtime non-secret config from the Baserow "Gwenda Config" database.
 *
 * One table, one row per value:
 *   Name     dotted key, e.g. forms.notify_email
 *   Value    string
 *   Env      all | dev | production, or a site's name (preview) for machine state
 *   Service  all | ops | web
 * For a given env + service the most specific row wins: Env beats Service beats `all`.
 *
 * Every env reads the same table with BASEROW_CONFIG_API_KEY (a token scoped to
 * this database only). It lives outside the Ops and Website databases so copying
 * data between envs never copies config. Secrets never belong here.
 */

export const CONFIG_DATABASE_NAME = "Gwenda Config";
export const CONFIG_TABLE_NAME = "Config";
/** Config Env values. A developer's machine reads "dev"; prod's preview is production. */
export const CONFIG_ENVS = ["dev", "production"];
export const CONFIG_SERVICES = ["ops", "web"];
export const CONFIG_CACHE_TTL_MS = 60_000;

const DEFAULT_BASEROW_API = "https://api.baserow.io";

const cache = new Map();
let tableIdByKey = new Map();

export function resetConfigCacheForTests() {
  cache.clear();
  tableIdByKey = new Map();
}

/**
 * The environment a runtime belongs to (its config Env): dev or production,
 * from SITE_ENV. Prod's preview runs as production. A developer's machine
 * (SITE_ENV=local) is dev.
 */
export function environmentOf(env = {}) {
  const raw = String(env.SITE_ENV || "")
    .trim()
    .toLowerCase();
  if (raw === "local" || raw === "development" || raw === "dev") return "dev";
  if (raw === "production" || raw === "prod") return "production";
  if (!raw) {
    // No default: code run outside a deployment without SITE_ENV used to read
    // production settings with whatever database keys it had, and on
    // 2026-09-26 wrote dev nights into the production calendar.
    throw new Error("SITE_ENV is not set. Use production, dev or local.");
  }
  return raw;
}

/**
 * A developer's machine (npm run ops:dev / web:dev set SITE_ENV=local): dev
 * settings plus that developer's own values from .env. Hosted dev is SITE_ENV=dev.
 */
export function isLocalMachine(env = {}) {
  const raw = String(env.SITE_ENV || "").trim().toLowerCase();
  return raw === "local" || raw === "development";
}

function text(value) {
  if (typeof value === "string") return value.trim();
  if (value == null) return "";
  if (typeof value === "object" && value.value != null) return String(value.value).trim();
  return String(value).trim();
}

function scope(value) {
  return text(value).toLowerCase() || "all";
}

function specificity(row, envName, service) {
  const rowEnv = scope(row.Env);
  const rowService = scope(row.Service);
  if (rowEnv !== "all" && rowEnv !== envName) return -1;
  if (rowService !== "all" && rowService !== service) return -1;
  return (rowEnv === envName ? 2 : 0) + (rowService === service ? 1 : 0);
}

/** Collapse config rows into key → value for one env + service. */
export function valuesFromRows(rows, envName, service) {
  const best = new Map();
  for (const row of rows || []) {
    const key = text(row.Name);
    if (!key) continue;
    const score = specificity(row, envName, service);
    if (score < 0) continue;
    const prev = best.get(key);
    if (!prev || score > prev.score) best.set(key, { score, value: text(row.Value) });
  }
  return Object.fromEntries([...best].map(([key, entry]) => [key, entry.value]));
}

function configError(message, status = 503) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function client(env) {
  const apiKey = env.BASEROW_CONFIG_API_KEY?.trim();
  if (!apiKey) {
    throw configError("BASEROW_CONFIG_API_KEY is not configured. Run npm run env:<app>:pull.");
  }
  const apiBase = (env.BASEROW_API_URL || DEFAULT_BASEROW_API).replace(/\/$/, "");
  async function call(path, init = {}) {
    const response = await fetch(`${apiBase}${path}`, {
      ...init,
      headers: {
        Authorization: `Token ${apiKey}`,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
      },
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      throw configError(
        `Config Baserow ${response.status}: ${body?.detail || body?.error || response.statusText}`,
        response.status >= 500 ? 502 : 503,
      );
    }
    return body;
  }
  return { apiKey, call };
}

async function configTableId(api) {
  const known = tableIdByKey.get(api.apiKey);
  if (known) return known;
  const tables = await api.call("/api/database/tables/all-tables/");
  const matches = (Array.isArray(tables) ? tables : []).filter(
    (table) => table.name === CONFIG_TABLE_NAME,
  );
  if (matches.length !== 1) {
    throw configError(
      matches.length
        ? `BASEROW_CONFIG_API_KEY sees ${matches.length} "${CONFIG_TABLE_NAME}" tables. Scope it to ${CONFIG_DATABASE_NAME}.`
        : `"${CONFIG_TABLE_NAME}" table not found. Run npm run setup:baserow-config.`,
    );
  }
  const id = String(matches[0].id);
  tableIdByKey.set(api.apiKey, id);
  return id;
}

async function listRows(api, tableId) {
  const rows = [];
  for (let page = 1; page <= 20; page += 1) {
    const body = await api.call(
      `/api/database/rows/table/${tableId}/?user_field_names=true&size=200&page=${page}`,
    );
    rows.push(...(body?.results || []));
    if (!body?.next) break;
  }
  return rows;
}

async function loadRows(env) {
  const api = client(env);
  const hit = cache.get(api.apiKey);
  if (hit && Date.now() - hit.at < CONFIG_CACHE_TTL_MS) return hit.rows;
  const rows = await listRows(api, await configTableId(api));
  cache.set(api.apiKey, { at: Date.now(), rows });
  return rows;
}

/** Every row, for the settings overview (cached like reads). */
export async function listConfigRows(env) {
  return loadRows(env);
}

/** A row's Env / Service value, lowercased ("all" when blank). */
export function rowScope(value) {
  return scope(value);
}

/** Flat key → value map for this runtime's env and the given service. */
export async function getConfigValues(env, service) {
  return valuesFromRows(await loadRows(env), environmentOf(env), service);
}

/** One value, or "" when unset or config is unavailable (callers apply defaults). */
export async function getConfigString(env, service, key) {
  try {
    return (await getConfigValues(env, service))[key] || "";
  } catch (error) {
    if (error?.status === 503) return "";
    throw error;
  }
}

/**
 * Create or update this runtime's own row (Env = current env, Service = service).
 * A runtime never writes `all` or another env's rows.
 */
export async function setConfigValue(env, service, key, value) {
  return setConfigValueFor(env, service, key, environmentOf(env), value);
}

/**
 * Exact row for one env + service (no fallback to `all`), bypassing the cache.
 * For machine state kept per site (build snapshots, secret fingerprints),
 * not for settings: settings use getConfigValues.
 */
export async function getConfigValueFor(env, service, key, envName) {
  const api = client(env);
  const rows = await listRows(api, await configTableId(api));
  const match = rows.find(
    (row) => text(row.Name) === key && scope(row.Env) === envName && scope(row.Service) === service,
  );
  return match ? text(match.Value) : "";
}

/** Delete every row named `key` (any Env / Service). Returns how many. */
export async function deleteConfigRows(env, key) {
  return deleteMatchingRows(env, (row) => text(row.Name) === key);
}

/** Delete every row of one Env, settings and machine state alike. Returns how many. */
export async function deleteConfigEnvRows(env, envName) {
  return deleteMatchingRows(env, (row) => scope(row.Env) === envName);
}

async function deleteMatchingRows(env, matches) {
  const api = client(env);
  const tableId = await configTableId(api);
  const rows = (await listRows(api, tableId)).filter(matches);
  for (const row of rows) {
    await api.call(`/api/database/rows/table/${tableId}/${row.id}/`, { method: "DELETE" });
  }
  if (rows.length) cache.delete(api.apiKey);
  return rows.length;
}

/** Create or update the exact row for one env + service. */
export async function setConfigValueFor(env, service, key, envName, value) {
  const api = client(env);
  const tableId = await configTableId(api);
  const rows = await listRows(api, tableId);
  const match = rows.find(
    (row) => text(row.Name) === key && scope(row.Env) === envName && scope(row.Service) === service,
  );
  const fields = { Name: key, Value: String(value ?? ""), Env: envName, Service: service };
  const path = match
    ? `/api/database/rows/table/${tableId}/${match.id}/?user_field_names=true`
    : `/api/database/rows/table/${tableId}/?user_field_names=true`;
  await api.call(path, { method: match ? "PATCH" : "POST", body: JSON.stringify(fields) });
  cache.delete(api.apiKey);
}
