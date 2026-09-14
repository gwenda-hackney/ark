export const DEFAULT_BASEROW_API = "https://api.baserow.io";

export const OPS_DATABASE_NAME = "Gwenda Ops";
export const TABLE_SECTIONS = "Menu Sections";
export const TABLE_ITEMS = "Menu Items";
export const TABLE_INGREDIENTS = "Ingredients";

export function baserowApiBase(env = {}) {
  return (env.BASEROW_API_URL || DEFAULT_BASEROW_API).replace(/\/$/, "");
}

export function baserowApiKey(env = {}) {
  return env.BASEROW_API_KEY?.trim() || "";
}

export function opsDatabaseId(env = {}) {
  return env.BASEROW_OPS_DATABASE_ID?.trim() || "";
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

export async function baserowFetch(env, path, init = {}) {
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
    throw error;
  }
  return json;
}

export async function listAllTables(env) {
  return baserowFetch(env, "/api/database/tables/all-tables/");
}

export async function resolveOpsTableIds(env) {
  const explicit = {
    sections: env.BASEROW_OPS_SECTIONS_TABLE_ID?.trim(),
    items: env.BASEROW_OPS_ITEMS_TABLE_ID?.trim(),
    ingredients: env.BASEROW_OPS_INGREDIENTS_TABLE_ID?.trim(),
  };
  if (explicit.sections && explicit.items && explicit.ingredients) {
    return explicit;
  }

  const tables = await listAllTables(env);
  const databaseId = opsDatabaseId(env);
  let scoped = Array.isArray(tables) ? tables : [];
  if (databaseId) {
    scoped = scoped.filter((table) => String(table.database_id) === databaseId);
  }

  const byName = (name) => scoped.filter((table) => table.name === name);
  const pick = (name, fallbackEnv) => {
    if (fallbackEnv) return fallbackEnv;
    const matches = byName(name);
    if (matches.length === 1) return String(matches[0].id);
    if (matches.length === 0) {
      const error = new Error(
        `Baserow table "${name}" not found. Run npm run setup:baserow-ops.`,
      );
      error.status = 503;
      throw error;
    }
    const error = new Error(
      `Multiple Baserow tables named "${name}". Set BASEROW_OPS_DATABASE_ID.`,
    );
    error.status = 503;
    throw error;
  };

  return {
    sections: pick(TABLE_SECTIONS, explicit.sections),
    items: pick(TABLE_ITEMS, explicit.items),
    ingredients: pick(TABLE_INGREDIENTS, explicit.ingredients),
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
