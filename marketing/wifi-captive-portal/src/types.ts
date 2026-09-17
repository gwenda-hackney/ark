export type Env = {
  BASEROW_API_KEY: string;
  /** Site Manager API key from unifi.ui.com → Settings → API Keys */
  UNIFI_SITE_MANAGER_API_KEY: string;
  /** Console id from unifi.ui.com/consoles/{id}/… */
  UNIFI_CONSOLE_ID: string;
  /** Optional static assets binding (logo + fonts served by Assets). */
  ASSETS?: Fetcher;
  /** Disambiguates Subscribers when the token sees multiple databases. */
  BASEROW_DATABASE_ID?: string;
  BASEROW_SUBSCRIBE_TABLE_NAME?: string;
  BASEROW_API_URL?: string;
  WIFI_SUBSCRIBE_TAG?: string;
  UNIFI_SITE_IDENTIFIER?: string;
  UNIFI_GUEST_MINUTES?: string;
  REDIRECT_URL?: string;
};

export const PRODUCTION_BASEROW_DATABASE_ID = "461843";
export const SUBSCRIBE_TABLE_NAME = "Subscribers";
export const DEFAULT_BASEROW_API_URL = "https://api.baserow.io";
export const DEFAULT_SUBSCRIBE_TAG = "wifi";
export const DEFAULT_SITE_IDENTIFIER = "default";
export const DEFAULT_GUEST_MINUTES = 1440;
export const DEFAULT_REDIRECT_URL = "https://gwenda.co.uk";

const tableIdCache = new Map<string, string>();

export function clearSubscribeTableIdCache() {
  tableIdCache.clear();
}

export function resolveDatabaseId(env: Env): string {
  return env.BASEROW_DATABASE_ID?.trim() || PRODUCTION_BASEROW_DATABASE_ID;
}

export function resolveSubscribeTableName(env: Env): string {
  return env.BASEROW_SUBSCRIBE_TABLE_NAME?.trim() || SUBSCRIBE_TABLE_NAME;
}

export function resolveApiUrl(env: Env): string {
  return (env.BASEROW_API_URL?.trim() || DEFAULT_BASEROW_API_URL).replace(
    /\/$/,
    "",
  );
}

export async function resolveSubscribeTableId(env: Env): Promise<string> {
  const apiKey = env.BASEROW_API_KEY?.trim();
  if (!apiKey) throw new Error("BASEROW_API_KEY is not configured");

  const tableName = resolveSubscribeTableName(env);
  const databaseId = resolveDatabaseId(env);
  const apiBase = resolveApiUrl(env);
  const cacheKey = `${apiKey}:${tableName}:${databaseId}`;
  const cached = tableIdCache.get(cacheKey);
  if (cached) return cached;

  const upstream = await fetch(`${apiBase}/api/database/tables/all-tables/`, {
    headers: { Authorization: `Token ${apiKey}` },
  });
  if (!upstream.ok) {
    throw new Error(`Could not list Baserow tables (${upstream.status})`);
  }
  const tables = (await upstream.json()) as Array<{
    id: number;
    name: string;
    database_id: number;
  }>;
  const matches = tables.filter(
    (table) =>
      table.name === tableName && String(table.database_id) === databaseId,
  );
  if (matches.length === 0) {
    throw new Error(
      `Baserow table "${tableName}" not found in database ${databaseId}.`,
    );
  }
  if (matches.length > 1) {
    throw new Error(`Multiple Baserow tables named "${tableName}".`);
  }
  const tableId = String(matches[0].id);
  tableIdCache.set(cacheKey, tableId);
  return tableId;
}

export function resolveSubscribeTag(env: Env): string {
  return env.WIFI_SUBSCRIBE_TAG?.trim() || DEFAULT_SUBSCRIBE_TAG;
}

export function resolveSiteIdentifier(env: Env): string {
  return env.UNIFI_SITE_IDENTIFIER?.trim() || DEFAULT_SITE_IDENTIFIER;
}

export function resolveGuestMinutes(env: Env): number {
  const n = Number.parseInt(env.UNIFI_GUEST_MINUTES?.trim() || "", 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_GUEST_MINUTES;
}

export function resolveRedirectUrl(env: Env): string {
  return env.REDIRECT_URL?.trim() || DEFAULT_REDIRECT_URL;
}
