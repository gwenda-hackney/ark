export const DEFAULT_BASEROW_API = "https://api.baserow.io";
export const DEV_BASEROW_DATABASE_ID = "465058";
export const RSVP_TABLE_NAME = "Event Invites";

const rsvpTableIdCache = new Map<string, string>();

function isProductionSite(env: NodeJS.ProcessEnv) {
  return env.SITE_ENV?.trim().toLowerCase() === "production";
}

export function rsvpTableName(env: NodeJS.ProcessEnv) {
  return env.BASEROW_RSVP_TABLE_NAME?.trim() || RSVP_TABLE_NAME;
}

function baserowDatabaseId(env: NodeJS.ProcessEnv) {
  const explicit = env.BASEROW_DATABASE_ID?.trim();
  if (explicit) return explicit;
  return isProductionSite(env) ? null : DEV_BASEROW_DATABASE_ID;
}

type ResolveResult =
  | { ok: true; tableId: string }
  | { ok: false; error: string };

export async function resolveRsvpTableId(
  env: NodeJS.ProcessEnv,
): Promise<ResolveResult> {
  const apiKey = env.BASEROW_API_KEY?.trim();
  if (!apiKey) {
    return { ok: false, error: "Baserow is not configured." };
  }

  const apiBase = (env.BASEROW_API_URL?.trim() || DEFAULT_BASEROW_API).replace(
    /\/$/,
    "",
  );
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

  const tables = (await upstream.json()) as Array<{
    id: number;
    name: string;
    database_id: number;
  }>;
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
