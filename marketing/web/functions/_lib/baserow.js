export const DEFAULT_BASEROW_API = "https://api.baserow.io";

/** Same database name in Gwenda (prod) and Gwenda Dev. */
export const WEBSITE_DATABASE_NAME = "Website";
export const SUBSCRIBE_TABLE_NAME = "Subscribers";
export const RSVP_TABLE_NAME = "Event Invites";
export const FORM_SUBMISSIONS_TABLE_NAME = "Form Submissions";

const tableIdCache = new Map();

export function clearBaserowTableIdCache() {
  tableIdCache.clear();
}

/** @deprecated Use clearBaserowTableIdCache */
export function clearRsvpTableIdCache() {
  clearBaserowTableIdCache();
}

export function isProductionSite(env) {
  return env.SITE_ENV?.trim().toLowerCase() === "production";
}

export function rsvpTableName(env) {
  return env.BASEROW_RSVP_TABLE_NAME?.trim() || RSVP_TABLE_NAME;
}

/** Optional numeric filter. Prefer a token that can see only one Website database. */
export function baserowDatabaseId(env) {
  return env.BASEROW_DATABASE_ID?.trim() || "";
}

async function resolveTableIdByName(env, tableName) {
  const apiKey = env.BASEROW_API_KEY?.trim();
  if (!apiKey) {
    return { ok: false, error: "Baserow is not configured." };
  }

  const apiBase = (env.BASEROW_API_URL || DEFAULT_BASEROW_API).replace(
    /\/$/,
    "",
  );
  const databaseId = baserowDatabaseId(env);
  const cacheKey = `${apiKey}:${tableName}:${databaseId}`;

  const cached = tableIdCache.get(cacheKey);
  if (cached) {
    return { ok: true, tableId: cached };
  }

  const upstream = await fetch(`${apiBase}/api/database/tables/all-tables/`, {
    headers: { Authorization: `Token ${apiKey}` },
  });

  if (!upstream.ok) {
    return { ok: false, error: "Could not list Baserow tables." };
  }

  const tables = await upstream.json();
  let matches = tables.filter((table) => table.name === tableName);
  if (databaseId) {
    matches = matches.filter(
      (table) => String(table.database_id) === databaseId,
    );
  }

  if (matches.length === 0) {
    return {
      ok: false,
      error: `Baserow table "${tableName}" not found.`,
    };
  }
  if (matches.length > 1) {
    return {
      ok: false,
      error: `Multiple Baserow tables named "${tableName}". Scope the token to the ${WEBSITE_DATABASE_NAME} database.`,
    };
  }

  const tableId = String(matches[0].id);
  tableIdCache.set(cacheKey, tableId);
  return { ok: true, tableId };
}

export async function resolveRsvpTableId(env) {
  const tableName = rsvpTableName(env);
  const result = await resolveTableIdByName(env, tableName);
  if (!result.ok && result.error?.includes("not found")) {
    return {
      ok: false,
      error: `Baserow table "${tableName}" not found. Run npm run setup:baserow-rsvp.`,
    };
  }
  return result;
}

export async function baserowRsvpRowsUrl(env) {
  const apiKey = env.BASEROW_API_KEY?.trim();
  if (!apiKey) {
    return { ok: false, error: "Baserow is not configured." };
  }

  const resolved = await resolveRsvpTableId(env);
  if (!resolved.ok) {
    return resolved;
  }

  const apiBase = (env.BASEROW_API_URL || DEFAULT_BASEROW_API).replace(
    /\/$/,
    "",
  );
  const { tableId } = resolved;
  return {
    ok: true,
    apiKey,
    tableId,
    rowsUrl: `${apiBase}/api/database/rows/table/${tableId}/?user_field_names=true`,
    rowUrl: (rowId) =>
      `${apiBase}/api/database/rows/table/${tableId}/${rowId}/?user_field_names=true`,
  };
}
