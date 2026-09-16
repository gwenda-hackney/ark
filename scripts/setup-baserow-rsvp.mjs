#!/usr/bin/env node
/**
 * Create (or repair) the Event Invites Baserow table for local dev + staging.
 *
 * Database tokens only allow row CRUD. Creating tables/fields requires a short-lived
 * JWT from POST /api/user/token-auth/ (Admin or Builder on the workspace).
 *
 * Dev and gwenda-staging share the same Baserow database (465058). Production tables
 * are created separately when you promote.
 *
 * Usage:
 *   npm run setup:baserow-rsvp
 *
 * Prompts for Baserow email + password on first login, then caches the JWT in
 * `.baserow-jwt.json`. Optional non-interactive:
 *   BASEROW_JWT_EMAIL, BASEROW_JWT_PASSWORD
 *
 * Optional:
 *   BASEROW_RSVP_TABLE_NAME=Event Invites
 *   BASEROW_API_URL=https://api.baserow.io
 */
import { getBaserowJwt } from "./lib/baserow-jwt.mjs";
import {
  DEFAULT_BASEROW_API,
  DEV_BASEROW_DATABASE_ID,
  DEV_SUBSCRIBE_TABLE_ID,
  PRODUCTION_SUBSCRIBE_TABLE_ID,
  RSVP_TABLE_NAME,
} from "../marketing/web/functions/_lib/baserow.js";

const EXPECTED_FIELDS = [
  {
    name: "Event Slug",
    body: { name: "Event Slug", type: "text", db_index: true },
  },
  {
    name: "Channel",
    body: {
      name: "Channel",
      type: "single_select",
      select_options: [
        { value: "Email", color: "blue" },
        { value: "Instagram", color: "light-orange" },
      ],
    },
  },
  {
    name: "Contact",
    body: { name: "Contact", type: "text" },
  },
  {
    name: "Source",
    body: { name: "Source", type: "text" },
  },
  {
    name: "Token",
    body: { name: "Token", type: "text", db_index: true },
  },
  {
    name: "RSVP Guests",
    body: {
      name: "RSVP Guests",
      type: "number",
      number_decimal_places: 0,
      number_negative: false,
    },
  },
  {
    name: "RSVP Updated",
    body: {
      name: "RSVP Updated",
      type: "date",
      date_format: "ISO",
      date_include_time: false,
    },
  },
];

function readEnv(name) {
  return process.env[name]?.trim() || "";
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
    throw new Error(`${init.method || "GET"} ${path} → ${response.status}: ${detail}`);
  }
  return json;
}

async function loadDatabaseTables(apiBase, jwt, databaseId, subscribeTableId, label) {
  const tables = await baserowRequest(
    apiBase,
    jwt,
    `/api/database/tables/database/${databaseId}/`,
  );
  const marker = tables.find((table) => String(table.id) === subscribeTableId);
  if (!marker) {
    throw new Error(
      `Expected ${label} Baserow database ${databaseId} to contain subscribe table ${subscribeTableId}.`,
    );
  }
  console.log(
    `${label} database ${databaseId} (subscribe table "${marker.name}" id ${subscribeTableId}).`,
  );
  return tables;
}

async function resolveProductionDatabaseId(apiBase, apiKey) {
  const response = await fetch(`${apiBase}/api/database/tables/all-tables/`, {
    headers: { Authorization: `Token ${apiKey}` },
  });
  if (!response.ok) {
    throw new Error(`Could not list Baserow tables (${response.status}).`);
  }
  const tables = await response.json();
  const subscribe = tables.find((table) => String(table.id) === PRODUCTION_SUBSCRIBE_TABLE_ID);
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

async function ensureFields(apiBase, jwt, tableId) {
  const fields = await baserowRequest(
    apiBase,
    jwt,
    `/api/database/fields/table/${tableId}/`,
  );
  const byName = new Map(fields.map((field) => [field.name, field]));
  const primary = fields.find((field) => field.primary);
  if (primary && primary.name !== "Name") {
    console.log(`Note: primary field is "${primary.name}" (code expects guest name in "Name").`);
  } else if (!byName.has("Name") && primary) {
    console.log(`Primary field "${primary.name}" will hold guest names.`);
  }

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

async function main() {
  const production = process.argv.includes("--production");
  const tableName = readEnv("BASEROW_RSVP_TABLE_NAME") || RSVP_TABLE_NAME;
  const apiBase = (readEnv("BASEROW_API_URL") || DEFAULT_BASEROW_API).replace(/\/$/, "");
  const apiKey = readEnv("BASEROW_API_KEY");

  let databaseId = readEnv("BASEROW_DATABASE_ID");
  let subscribeTableId = readEnv("BASEROW_TABLE_ID") || DEV_SUBSCRIBE_TABLE_ID;
  let label = "Dev";

  if (production) {
    if (!apiKey) {
      throw new Error("BASEROW_API_KEY is required for --production (resolves prod database id).");
    }
    databaseId = databaseId || (await resolveProductionDatabaseId(apiBase, apiKey));
    subscribeTableId = PRODUCTION_SUBSCRIBE_TABLE_ID;
    label = "Production";
  } else {
    databaseId = databaseId || DEV_BASEROW_DATABASE_ID;
  }

  const jwt = await getBaserowJwt(apiBase, {
    hint: `database ${databaseId}`,
  });

  console.log(`Table "${tableName}"…`);
  const tables = await loadDatabaseTables(
    apiBase,
    jwt,
    databaseId,
    subscribeTableId,
    label,
  );
  const table = await findOrCreateTable(
    tables,
    apiBase,
    jwt,
    databaseId,
    tableName,
  );

  console.log("Ensuring fields:");
  await ensureFields(apiBase, jwt, table.id);

  const gridUrl = `https://baserow.io/database/${databaseId}/table/${table.id}/`;
  console.log("");
  console.log(`Event Invites table ready (id ${table.id}).`);
  console.log(`Grid: ${gridUrl}`);
  console.log("");
  if (production) {
    console.log("Production table created. The site resolves this table by name at runtime.");
  } else {
    console.log("Next:");
    console.log("  1. Create a database token (Settings → Database tokens) with CRUD on this table.");
    console.log("  2. Set BASEROW_API_KEY in .env (same token works for dev + staging).");
    console.log(`  3. Set BASEROW_RSVP_GRID_URL=${gridUrl} in repo-root .env`);
    console.log("");
    console.log("Runtime code resolves the table by name — no table id in .env.");
    console.log("Production: npm run setup:baserow-rsvp -- --production");
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
