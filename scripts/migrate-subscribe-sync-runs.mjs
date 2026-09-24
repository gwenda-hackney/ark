#!/usr/bin/env node
/**
 * One-shot migration: create (or repair) the production Baserow table
 * "Subscribe sync runs" for Mailchimp sync audit history.
 *
 * Database tokens only allow row CRUD. Creating tables/fields needs a JWT
 * from POST /api/user/token-auth/ (Admin or Builder on the workspace).
 *
 * Usage (from repo root):
 *   CONFIRM_PRODUCTION_MIGRATE=1 npm run migrate:subscribe-sync-runs
 *
 * Credentials: cached JWT in `.baserow-jwt.json` after first login, or
 *   BASEROW_JWT_EMAIL, BASEROW_JWT_PASSWORD
 *   or interactive prompt when stdin is a TTY
 *
 * After success, set BASEROW_SYNC_LOG_TABLE_ID in
 * marketing/subscribe-mailchimp-sync/wrangler.toml [vars] and redeploy.
 */
import { getBaserowJwt } from "./lib/baserow-jwt.mjs";
import { loadRepoEnv } from "./lib/load-env.mjs";
import { loadAppSecretsFromSm } from "./lib/bitwarden-sm.mjs";

const DEFAULT_BASEROW_API = "https://api.baserow.io";
const PRODUCTION_SUBSCRIBE_TABLE_ID = "1017358";
const SYNC_RUNS_TABLE_NAME = "Subscribe sync runs";

const EXPECTED_FIELDS = [
  {
    name: "Started",
    body: {
      name: "Started",
      type: "date",
      date_include_time: true,
      date_format: "ISO",
    },
  },
  { name: "Trigger", body: { name: "Trigger", type: "text" } },
  { name: "Dry run", body: { name: "Dry run", type: "boolean" } },
  {
    name: "Scanned",
    body: { name: "Scanned", type: "number", number_decimal_places: 0 },
  },
  {
    name: "Synced",
    body: { name: "Synced", type: "number", number_decimal_places: 0 },
  },
  {
    name: "Errors",
    body: { name: "Errors", type: "number", number_decimal_places: 0 },
  },
  { name: "Ok", body: { name: "Ok", type: "boolean" } },
  { name: "Results", body: { name: "Results", type: "long_text" } },
];

function readEnv(key) {
  return process.env[key]?.trim() || "";
}

async function baserowRequest(apiBase, jwt, path, init = {}) {
  const url = path.startsWith("http") ? path : `${apiBase}${path}`;
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `JWT ${jwt}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await response.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!response.ok) {
    const detail = json?.detail || json?.error || text.slice(0, 300);
    throw new Error(
      `${init.method || "GET"} ${path} → ${response.status}: ${detail}`,
    );
  }
  return json;
}

async function resolveProductionDatabaseId(apiBase, apiKey) {
  const response = await fetch(`${apiBase}/api/database/tables/all-tables/`, {
    headers: { Authorization: `Token ${apiKey}` },
  });
  if (!response.ok) {
    throw new Error(`Could not list Baserow tables (${response.status}).`);
  }
  const tables = await response.json();
  const subscribe = tables.find(
    (table) => String(table.id) === PRODUCTION_SUBSCRIBE_TABLE_ID,
  );
  if (!subscribe) {
    throw new Error(
      `Production subscribe table ${PRODUCTION_SUBSCRIBE_TABLE_ID} not visible to BASEROW_API_KEY.`,
    );
  }
  return String(subscribe.database_id);
}

async function findOrCreateTable(tables, apiBase, jwt, databaseId, tableName) {
  const existing = tables.find((table) => table.name === tableName);
  if (existing) {
    console.log(`Using existing table "${tableName}" (id ${existing.id}).`);
    return existing;
  }

  const created = await baserowRequest(
    apiBase,
    jwt,
    `/api/database/tables/database/${databaseId}/`,
    {
      method: "POST",
      body: JSON.stringify({ name: tableName }),
    },
  );
  console.log(`Created table "${tableName}" (id ${created.id}).`);
  return created;
}

async function ensurePrimaryNamedRun(apiBase, jwt, tableId) {
  const fields = await baserowRequest(
    apiBase,
    jwt,
    `/api/database/fields/table/${tableId}/`,
  );
  const primary = fields.find((field) => field.primary);
  if (!primary) {
    throw new Error(`No primary field on table ${tableId}.`);
  }
  if (primary.name === "Run") {
    console.log(`  ✓ Run (primary)`);
    return fields;
  }

  await baserowRequest(apiBase, jwt, `/api/database/fields/${primary.id}/`, {
    method: "PATCH",
    body: JSON.stringify({ name: "Run" }),
  });
  console.log(`  ~ renamed primary "${primary.name}" → "Run"`);
  return baserowRequest(apiBase, jwt, `/api/database/fields/table/${tableId}/`);
}

async function ensureFields(apiBase, jwt, tableId) {
  let fields = await ensurePrimaryNamedRun(apiBase, jwt, tableId);
  const byName = new Map(fields.map((field) => [field.name, field]));

  for (const expected of EXPECTED_FIELDS) {
    if (byName.has(expected.name)) {
      console.log(`  ✓ ${expected.name}`);
      continue;
    }
    await baserowRequest(apiBase, jwt, `/api/database/fields/table/${tableId}/`, {
      method: "POST",
      body: JSON.stringify(expected.body),
    });
    console.log(`  + ${expected.name}`);
  }
}


/** Production Website token (live Subscribers), from Secrets Manager. */
function productionWebsiteBaserowKey() {
  const { values } = loadAppSecretsFromSm("web", "production");
  return values.get("BASEROW_API_KEY")?.trim() || "";
}

async function main() {
  loadRepoEnv();

  if (process.env.CONFIRM_PRODUCTION_MIGRATE !== "1") {
    console.error(
      "Refusing to migrate production without CONFIRM_PRODUCTION_MIGRATE=1",
    );
    process.exit(1);
  }

  const apiBase = (readEnv("BASEROW_API_URL") || DEFAULT_BASEROW_API).replace(
    /\/$/,
    "",
  );
  const apiKey = productionWebsiteBaserowKey();
  if (!apiKey) {
    throw new Error("BASEROW_WEBSITE_API_KEY__PRODUCTION is missing from Secrets Manager.");
  }

  const databaseId = await resolveProductionDatabaseId(apiBase, apiKey);
  console.log(
    `Production database ${databaseId} (subscribe table ${PRODUCTION_SUBSCRIBE_TABLE_ID}).`,
  );

  const jwt = await getBaserowJwt(apiBase, {
    hint: `database ${databaseId}`,
  });

  const tables = await baserowRequest(
    apiBase,
    jwt,
    `/api/database/tables/database/${databaseId}/`,
  );
  const table = await findOrCreateTable(
    tables,
    apiBase,
    jwt,
    databaseId,
    SYNC_RUNS_TABLE_NAME,
  );

  console.log("Ensuring fields:");
  await ensureFields(apiBase, jwt, table.id);

  const gridUrl = `https://baserow.io/database/${databaseId}/table/${table.id}/`;
  console.log("");
  console.log(`Subscribe sync runs table ready (id ${table.id}).`);
  console.log(`Grid: ${gridUrl}`);
  console.log("");
  console.log("Next:");
  console.log(
    `  1. Set BASEROW_SYNC_LOG_TABLE_ID = "${table.id}" in marketing/subscribe-mailchimp-sync/wrangler.toml [vars]`,
  );
  console.log(
    "  2. Optionally set BASEROW_SYNC_LOG_TABLE_ID in repo-root .env for local CLI",
  );
  console.log("  3. Deploy the Worker (push or wrangler deploy)");
  console.log(
    "  4. Ensure BASEROW_API_KEY database token can create rows on this table",
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
