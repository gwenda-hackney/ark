export const DEFAULT_BASEROW_API = "https://api.baserow.io";

export const OPS_DATABASE_NAME = "Gwenda Ops";
export const TABLE_SECTIONS = "Menu Sections";
export const TABLE_ITEMS = "Menu Items";
export const TABLE_INGREDIENTS = "Ingredients";
export const TABLE_INVENTORY = "Inventory";
export const TABLE_SUPPLIERS = "Suppliers";
export const TABLE_INVENTORY_SUPPLIERS = "Inventory suppliers";
export const TABLE_USERS = "Users";
export const TABLE_POS_MENUS = "POS Menus";
export const TABLE_MENU_PLACEMENTS = "Menu placements";
export const TABLE_EVENTS = "Events";
export const TABLE_EVENT_DATES = "Event dates";
export const TABLE_ARTISTS = "Artists";
/** Ops' record of play applicants (decision, artist name and link), by email. */
export const TABLE_GUEST_ARTISTS = "Guest artists";

/** Baserow Cloud allows 10 concurrent API requests. Stay under that. */
export const BASEROW_MAX_CONCURRENT = 8;
export const BASEROW_MAX_RETRIES = 4;
export const BASEROW_RETRY_CAP_MS = 5000;
/** Drop leases from canceled requests whose `finally` never ran. */
export const BASEROW_LEASE_STALE_MS = 8000;
/** Do not wait on another request's slot forever (Workers treat that as a hang). */
export const BASEROW_SLOT_WAIT_CAP_MS = 1000;

export function baserowApiBase(env = {}) {
  return (env.BASEROW_API_URL || DEFAULT_BASEROW_API).replace(/\/$/, "");
}

export function baserowApiKey(env = {}) {
  return env.BASEROW_API_KEY?.trim() || "";
}

function requireKey(env) {
  const apiKey = baserowApiKey(env);
  if (!apiKey) {
    const error = new Error("BASEROW_API_KEY is not configured.");
    error.status = 503;
    throw error;
  }
  return apiKey;
}

let tableIdCache = null;
let tableIdCacheKey = "";
let tableIdCacheAt = 0;
const TABLE_ID_CACHE_TTL_MS = 5_000;
/** Request-local leases. A counter leaks when Workers cancel `finally` after HMR/abort. */
const activeLeases = new Set();

function defaultSleep(ms) {
  // `setTimeout` callbacks can run in another request's context in workerd.
  // `scheduler.wait` stays on the creating request.
  if (globalThis.navigator?.userAgent === "Cloudflare-Workers") {
    const wait = globalThis.scheduler?.wait;
    if (typeof wait === "function") return wait.call(globalThis.scheduler, ms);
  }
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const baserowClient = {
  maxConcurrent: BASEROW_MAX_CONCURRENT,
  maxRetries: BASEROW_MAX_RETRIES,
  slotWaitMs: 15,
  leaseStaleMs: BASEROW_LEASE_STALE_MS,
  slotWaitCapMs: BASEROW_SLOT_WAIT_CAP_MS,
  sleep: defaultSleep,
};

export function resetBaserowClientForTests() {
  activeLeases.clear();
  tableIdCache = null;
  tableIdCacheKey = "";
  tableIdCacheAt = 0;
  baserowClient.maxConcurrent = BASEROW_MAX_CONCURRENT;
  baserowClient.maxRetries = BASEROW_MAX_RETRIES;
  baserowClient.slotWaitMs = 15;
  baserowClient.leaseStaleMs = BASEROW_LEASE_STALE_MS;
  baserowClient.slotWaitCapMs = BASEROW_SLOT_WAIT_CAP_MS;
  baserowClient.sleep = defaultSleep;
}

export function parseRetryAfterMs(header, attempt = 0) {
  const raw = String(header || "").trim();
  if (raw) {
    if (/^\d+(\.\d+)?$/.test(raw)) {
      return Math.min(BASEROW_RETRY_CAP_MS, Math.max(0, Number(raw) * 1000));
    }
    const date = Date.parse(raw);
    if (!Number.isNaN(date)) {
      return Math.min(BASEROW_RETRY_CAP_MS, Math.max(0, date - Date.now()));
    }
  }
  const base = Math.min(BASEROW_RETRY_CAP_MS, 200 * 2 ** attempt);
  return base;
}

function pruneLeases(now = Date.now()) {
  const staleMs = Math.max(1, Number(baserowClient.leaseStaleMs) || BASEROW_LEASE_STALE_MS);
  for (const lease of activeLeases) {
    if (now - lease.at >= staleMs) activeLeases.delete(lease);
  }
}

async function withBaserowSlot(work) {
  const max = Math.max(1, Number(baserowClient.maxConcurrent) || BASEROW_MAX_CONCURRENT);
  const waitMs = Math.max(1, Number(baserowClient.slotWaitMs) || 15);
  const waitCapMs = Math.max(waitMs, Number(baserowClient.slotWaitCapMs) || BASEROW_SLOT_WAIT_CAP_MS);
  const waitDeadline = Date.now() + waitCapMs;
  const lease = { at: Date.now() };
  // Poll with a request-local sleep. Never resolve another request's Promise:
  // Workers cancel those continuations and then treat the waiter as hung.
  for (;;) {
    pruneLeases();
    if (activeLeases.size < max) break;
    if (Date.now() >= waitDeadline) break;
    await baserowClient.sleep(waitMs);
  }
  activeLeases.add(lease);
  try {
    return await work();
  } finally {
    activeLeases.delete(lease);
  }
}

async function baserowFetchOnce(env, path, init = {}) {
  const apiKey = requireKey(env);
  const apiBase = baserowApiBase(env);
  const url = path.startsWith("http") ? path : `${apiBase}${path}`;
  const headers = {
    Authorization: `Token ${apiKey}`,
    ...(init.body && !(init.body instanceof FormData)
      ? { "Content-Type": "application/json" }
      : {}),
    ...(init.headers || {}),
  };
  const response = await fetch(url, { ...init, headers });
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!response.ok) {
    const detail =
      json?.detail || json?.error || text.slice(0, 300) || response.statusText;
    const error = new Error(`Baserow ${response.status}: ${detail}`);
    error.status = response.status >= 500 ? 502 : response.status;
    if (response.status === 429) {
      const retryAfter = response.headers.get("Retry-After");
      if (retryAfter) error.retryAfterMs = parseRetryAfterMs(retryAfter, 0);
    }
    throw error;
  }
  return json;
}

export async function baserowFetch(env, path, init = {}) {
  const maxRetries = Math.max(0, Number(baserowClient.maxRetries) || 0);
  let attempt = 0;
  for (;;) {
    try {
      return await withBaserowSlot(() => baserowFetchOnce(env, path, init));
    } catch (error) {
      if (error?.status !== 429 || attempt >= maxRetries) throw error;
      const waitMs =
        typeof error.retryAfterMs === "number"
          ? error.retryAfterMs
          : parseRetryAfterMs(null, attempt);
      attempt += 1;
      await baserowClient.sleep(waitMs);
    }
  }
}

export async function listAllTables(env) {
  return baserowFetch(env, "/api/database/tables/all-tables/");
}

/**
 * Tables that identify each database. A database token cannot read database
 * names, only the tables it may use, so the token picks the workspace (Gwenda
 * Dev or Gwenda) and these names pick the database in it. No ids in config.
 */
export const DATABASE_FINGERPRINTS = {
  ops: [TABLE_SECTIONS, TABLE_ITEMS, TABLE_INGREDIENTS],
  // Every Website copy has these two; production has no Event Invites table.
  website: ["Subscribers", "Form Submissions"],
};

export const OPS_TABLE_SPECS = [
  { key: "sections", name: TABLE_SECTIONS, required: true },
  { key: "items", name: TABLE_ITEMS, required: true },
  { key: "ingredients", name: TABLE_INGREDIENTS, required: true },
  { key: "inventory", name: TABLE_INVENTORY, required: false },
  { key: "suppliers", name: TABLE_SUPPLIERS, required: false },
  { key: "inventorySuppliers", name: TABLE_INVENTORY_SUPPLIERS, required: false },
  { key: "users", name: TABLE_USERS, required: false },
  { key: "posMenus", name: TABLE_POS_MENUS, required: false },
  { key: "menuPlacements", name: TABLE_MENU_PLACEMENTS, required: false },
  { key: "events", name: TABLE_EVENTS, required: false },
  { key: "eventDates", name: TABLE_EVENT_DATES, required: false },
  { key: "artists", name: TABLE_ARTISTS, required: false },
  { key: "guestArtists", name: TABLE_GUEST_ARTISTS, required: false },
];

/**
 * The one database (of those the token can see) that has every table in
 * `fingerprint`. Several matches means the token was given too much.
 * @param {"ops" | "website"} kind
 */
export function pickDatabaseId(tables, kind) {
  const fingerprint = DATABASE_FINGERPRINTS[kind];
  const byDb = new Map();
  for (const table of Array.isArray(tables) ? tables : []) {
    const id = String(table.database_id);
    if (!byDb.has(id)) byDb.set(id, new Set());
    byDb.get(id).add(table.name);
  }
  const matches = [...byDb.entries()]
    .filter(([, names]) => fingerprint.every((name) => names.has(name)))
    .map(([id]) => id);
  if (matches.length === 1) return matches[0];
  const error = new Error(
    matches.length === 0
      ? `This Baserow token sees no ${kind} database (tables ${fingerprint.join(", ")}). Check the token's database permissions.`
      : `This Baserow token sees ${matches.length} ${kind} databases (${matches.join(", ")}). Limit the token to one.`,
  );
  error.status = 503;
  throw error;
}

export function pickOpsDatabaseId(tables) {
  return pickDatabaseId(tables, "ops");
}

function pickTableId(scoped, name, { required = true } = {}) {
  const matches = scoped.filter((table) => table.name === name);
  if (matches.length === 1) return String(matches[0].id);
  if (matches.length === 0) {
    if (!required) return "";
    const error = new Error(
      `Baserow table "${name}" not found. Run npm run setup:baserow-ops.`,
    );
    error.status = 503;
    throw error;
  }
  const error = new Error(
    `Multiple Baserow tables named "${name}" in this database. Rename duplicates.`,
  );
  error.status = 503;
  throw error;
}

/**
 * Resolve Ops table ids from the Baserow catalog by stable names.
 * Cached per isolate and token.
 */
export async function resolveOpsTableIds(env) {
  const cacheKey = baserowApiKey(env);
  if (
    tableIdCache &&
    tableIdCacheKey === cacheKey &&
    Date.now() - tableIdCacheAt < TABLE_ID_CACHE_TTL_MS
  ) {
    return tableIdCache;
  }

  const tables = await listAllTables(env);
  const databaseId = pickOpsDatabaseId(tables);
  const scoped = (Array.isArray(tables) ? tables : []).filter(
    (table) => String(table.database_id) === databaseId,
  );

  const resolved = { databaseId };
  for (const spec of OPS_TABLE_SPECS) {
    resolved[spec.key] = pickTableId(scoped, spec.name, { required: spec.required });
  }
  tableIdCache = resolved;
  tableIdCacheKey = cacheKey;
  tableIdCacheAt = Date.now();
  return resolved;
}

/** Query params that list only rows linked to `rowId` on `fieldName`. */
export function linkHasQuery(fieldName, rowId) {
  return {
    filters: JSON.stringify({
      filter_type: "AND",
      filters: [
        {
          field: fieldName,
          type: "link_row_has",
          value: String(rowId),
        },
      ],
    }),
  };
}

export async function listAllRows(env, tableId, { filters } = {}) {
  const rows = [];
  let page = 1;
  for (;;) {
    const params = new URLSearchParams({
      user_field_names: "true",
      size: "200",
      page: String(page),
    });
    if (filters) {
      for (const [key, value] of Object.entries(filters)) {
        params.set(key, String(value));
      }
    }
    const payload = await baserowFetch(
      env,
      `/api/database/rows/table/${tableId}/?${params}`,
    );
    const batch = payload?.results || [];
    rows.push(...batch);
    if (!payload?.next) break;
    page += 1;
    if (page > 50) break;
  }
  return rows;
}

export async function getRow(env, tableId, rowId) {
  return baserowFetch(
    env,
    `/api/database/rows/table/${tableId}/${rowId}/?user_field_names=true`,
  );
}

export async function createRow(env, tableId, fields) {
  return baserowFetch(env, `/api/database/rows/table/${tableId}/?user_field_names=true`, {
    method: "POST",
    body: JSON.stringify(fields),
  });
}

export async function updateRow(env, tableId, rowId, fields) {
  return baserowFetch(
    env,
    `/api/database/rows/table/${tableId}/${rowId}/?user_field_names=true`,
    {
      method: "PATCH",
      body: JSON.stringify(fields),
    },
  );
}

export async function deleteRow(env, tableId, rowId) {
  return baserowFetch(env, `/api/database/rows/table/${tableId}/${rowId}/`, {
    method: "DELETE",
  });
}

export async function deleteRowsInOrder(env, tableId, rowIds) {
  for (const rowId of rowIds) {
    await deleteRow(env, tableId, rowId);
  }
}

/** Upload a user file, then attach via file field name on a row. */
export async function uploadUserFile(env, bytes, { filename, contentType }) {
  const form = new FormData();
  form.append(
    "file",
    new Blob([bytes], { type: contentType || "application/octet-stream" }),
    filename || "upload.bin",
  );
  return baserowFetch(env, "/api/user-files/upload-file/", {
    method: "POST",
    body: form,
  });
}

export function linkIds(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (typeof entry === "number") return entry;
      if (typeof entry === "string" && /^\d+$/.test(entry)) return Number(entry);
      if (entry && typeof entry === "object" && entry.id != null) return Number(entry.id);
      return null;
    })
    .filter((id) => Number.isFinite(id));
}

export function linkValue(value) {
  const ids = linkIds(value);
  return ids[0] ?? null;
}

export function fileUrl(value) {
  if (!Array.isArray(value) || value.length === 0) return null;
  const first = value[0];
  return first?.url || first?.thumbnails?.card_cover?.url || null;
}

export function boolField(value) {
  return value === true || value === "true";
}
