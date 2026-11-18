/**
 * Baserow helpers for scripts/setup-baserow-rsvp.mjs only: RSVP and event
 * invites are the last thing on Baserow, until they move to D1 (#237).
 * Everything else is on D1 (#234).
 */
/** Answers worth waiting out: Baserow throttling, or a gateway blip. */
const RETRY_STATUSES = new Set([429, 502, 503, 504]);
const MAX_ATTEMPTS = 7;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** How long to wait before retry `attempt` (1-based): Retry-After, else 1s, 2s, 4s… up to 60s. */
export function retryDelayMs(response, attempt) {
  const header = Number(response.headers.get("retry-after"));
  if (Number.isFinite(header) && header > 0) return Math.min(header, 60) * 1000;
  return Math.min(2 ** (attempt - 1), 60) * 1000;
}

/**
 * One Baserow API call with `Authorization: <scheme> <credential>`. Retries
 * throttled (429) and gateway (502–504) answers, so a big copy slows down
 * instead of stopping halfway.
 */
export async function baserowRequest(
  apiBase,
  scheme,
  credential,
  path,
  init = {},
  { fetchImpl = fetch, wait = sleep } = {},
) {
  const url = path.startsWith("http") ? path : `${apiBase}${path}`;
  for (let attempt = 1; ; attempt += 1) {
    const response = await fetchImpl(url, {
      ...init,
      headers: {
        Authorization: `${scheme} ${credential}`,
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    });
    if (RETRY_STATUSES.has(response.status) && attempt < MAX_ATTEMPTS) {
      const ms = retryDelayMs(response, attempt);
      console.log(`  Baserow answered ${response.status}; retrying in ${ms / 1000}s…`);
      await wait(ms);
      continue;
    }
    const text = await response.text();
    let json;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    if (!response.ok) {
      const detail = json?.detail || json?.error || text.slice(0, 400);
      throw new Error(`${init.method || "GET"} ${path} → ${response.status}: ${detail}`);
    }
    return json;
  }
}

export function jwtRequest(apiBase, jwt, path, init = {}) {
  return baserowRequest(apiBase, "JWT", jwt, path, init);
}

export async function findWorkspaceByName(apiBase, jwt, name) {
  const list = await jwtRequest(apiBase, jwt, "/api/workspaces/");
  const workspaces = Array.isArray(list) ? list : [];
  const norm = (value) => String(value).trim().toLowerCase();
  return workspaces.find((ws) => norm(ws.name) === norm(name)) || null;
}

export async function findDatabaseByName(apiBase, jwt, workspaceId, name) {
  const apps = await jwtRequest(
    apiBase,
    jwt,
    `/api/applications/workspace/${workspaceId}/`,
  );
  const list = Array.isArray(apps) ? apps : [];
  return (
    list.find((app) => app.type === "database" && app.name === name) || null
  );
}

export const WEBSITE_DATABASE_NAME = "Website";
export const GWENDA_WORKSPACE_NAME = "Gwenda";
export const GWENDA_DEV_WORKSPACE_NAME = "Gwenda Dev";

/** JWT lookup: Website DB in Gwenda (prod) or Gwenda Dev. */
export async function resolveWebsiteDatabase(
  apiBase,
  jwt,
  { production = false } = {},
) {
  const workspaceName = production
    ? GWENDA_WORKSPACE_NAME
    : GWENDA_DEV_WORKSPACE_NAME;
  const workspace = await findWorkspaceByName(apiBase, jwt, workspaceName);
  if (!workspace) {
    throw new Error(`Baserow workspace "${workspaceName}" not found.`);
  }
  const database = await findDatabaseByName(
    apiBase,
    jwt,
    workspace.id,
    WEBSITE_DATABASE_NAME,
  );
  if (!database) {
    throw new Error(
      `Database "${WEBSITE_DATABASE_NAME}" not found in workspace "${workspaceName}".`,
    );
  }
  return {
    workspaceId: String(workspace.id),
    workspaceName,
    databaseId: String(database.id),
    databaseName: WEBSITE_DATABASE_NAME,
  };
}
