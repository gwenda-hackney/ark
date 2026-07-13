export const DEFAULT_BASEROW_API = "https://api.baserow.io";

/** Dev + gwenda-staging share this Baserow database. Production uses separate tables. */
export const DEV_BASEROW_DATABASE_ID = "465058";
export const DEV_SUBSCRIBE_TABLE_ID = "1024006";
export const PRODUCTION_SUBSCRIBE_TABLE_ID = "1017358";
export const RSVP_TABLE_NAME = "Event Invites";

const rsvpTableIdCache = new Map();

export function clearRsvpTableIdCache() {
  rsvpTableIdCache.clear();
}

export function isProductionSite(env) {
  return env.SITE_ENV?.trim().toLowerCase() === "production";
}

/** Subscribe list table — dev/staging default unless BASEROW_TABLE_ID is set. */
export function subscribeTableId(env) {
  const explicit = env.BASEROW_TABLE_ID?.trim();
  if (explicit) return explicit;
  return isProductionSite(env)
    ? PRODUCTION_SUBSCRIBE_TABLE_ID
    : DEV_SUBSCRIBE_TABLE_ID;
}

export function rsvpTableName(env) {
  return env.BASEROW_RSVP_TABLE_NAME?.trim() || RSVP_TABLE_NAME;
}

/** Optional disambiguator when the token can see multiple databases. */
export function baserowDatabaseId(env) {
  const explicit = env.BASEROW_DATABASE_ID?.trim();
  if (explicit) return explicit;
  return isProductionSite(env) ? null : DEV_BASEROW_DATABASE_ID;
}

export async function resolveRsvpTableId(env) {
  const apiKey = env.BASEROW_API_KEY?.trim();
  if (!apiKey) {
    return { ok: false, error: "Baserow is not configured." };
  }

  const apiBase = (env.BASEROW_API_URL || DEFAULT_BASEROW_API).replace(/\/$/, "");
  const tableName = rsvpTableName(env);
  const databaseId = baserowDatabaseId(env);
  const cacheKey = `${apiKey}:${tableName}:${databaseId ?? ""}`;

  const cached = rsvpTableIdCache.get(cacheKey);
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
      error: `Baserow table "${tableName}" not found. Run npm run setup:baserow-rsvp.`,
    };
  }
  if (matches.length > 1) {
    return {
      ok: false,
      error: `Multiple Baserow tables named "${tableName}". Set BASEROW_DATABASE_ID.`,
    };
  }

  const tableId = String(matches[0].id);
  rsvpTableIdCache.set(cacheKey, tableId);
  return { ok: true, tableId };
}

export async function baserowRowsUrl(env) {
  const apiKey = env.BASEROW_API_KEY?.trim();
  const tableId = subscribeTableId(env);
  const apiBase = (env.BASEROW_API_URL || DEFAULT_BASEROW_API).replace(/\/$/, "");
  if (!apiKey || !tableId) {
    return { ok: false, error: "Baserow is not configured." };
  }
  return {
    ok: true,
    apiKey,
    tableId,
    rowsUrl: `${apiBase}/api/database/rows/table/${tableId}/?user_field_names=true`,
    rowUrl: (rowId) =>
      `${apiBase}/api/database/rows/table/${tableId}/${rowId}/?user_field_names=true`,
  };
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

  const apiBase = (env.BASEROW_API_URL || DEFAULT_BASEROW_API).replace(/\/$/, "");
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
