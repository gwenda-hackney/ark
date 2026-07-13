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
 * Prompts for Baserow email + password (not stored). Optional non-interactive:
 *   BASEROW_JWT_EMAIL, BASEROW_JWT_PASSWORD
 *
 * Optional:
 *   BASEROW_RSVP_TABLE_NAME=Event Invites
 *   BASEROW_API_URL=https://api.baserow.io
 */
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import {
  DEFAULT_BASEROW_API,
  DEV_BASEROW_DATABASE_ID,
  DEV_SUBSCRIBE_TABLE_ID,
  RSVP_TABLE_NAME,
} from "../web/functions/_lib/baserow.js";

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

function promptHidden(question) {
  return new Promise((resolve, reject) => {
    stdout.write(question);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");

    let password = "";
    const onData = (char) => {
      if (char === "\n" || char === "\r" || char === "\u0004") {
        stdin.setRawMode(false);
        stdin.pause();
        stdin.removeListener("data", onData);
        stdout.write("\n");
        resolve(password);
        return;
      }
      if (char === "\u0003") {
        stdin.setRawMode(false);
        stdin.pause();
        stdin.removeListener("data", onData);
        stdout.write("\n");
        process.exit(130);
      }
      if (char === "\u007f") {
        if (password.length > 0) password = password.slice(0, -1);
        return;
      }
      password += char;
    };

    stdin.on("data", onData);
  });
}

async function promptCredentials(databaseId) {
  let email = readEnv("BASEROW_JWT_EMAIL");
  let password = readEnv("BASEROW_JWT_PASSWORD");
  if (email && password) {
    return { email, password };
  }

  if (!stdin.isTTY) {
    throw new Error(
      "Set BASEROW_JWT_EMAIL and BASEROW_JWT_PASSWORD for non-interactive use.",
    );
  }

  console.log(
    `Log in with your Baserow account (Admin or Builder on database ${databaseId}).`,
  );
  console.log("Credentials are not saved — used once for a short-lived JWT.\n");

  const rl = createInterface({ input: stdin, output: stdout });
  try {
    if (!email) {
      email = (await rl.question("Baserow email: ")).trim();
    }
  } finally {
    rl.close();
  }

  if (!password) {
    password = await promptHidden("Baserow password: ");
  }

  if (!email || !password) {
    throw new Error("Email and password are required.");
  }

  return { email, password };
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

async function fetchJwt(apiBase, email, password) {
  const response = await fetch(`${apiBase}/api/user/token-auth/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: email, password }),
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(
      `Baserow login failed (${response.status}): ${payload.detail || payload.error || "check email/password"}`,
    );
  }
  const token = payload.access_token || payload.token;
  if (!token) {
    throw new Error("Baserow login succeeded but no access_token in response.");
  }
  return token;
}

async function loadDevDatabaseTables(apiBase, jwt, databaseId, subscribeTableId) {
  const tables = await baserowRequest(
    apiBase,
    jwt,
    `/api/database/tables/database/${databaseId}/`,
  );
  const marker = tables.find((table) => String(table.id) === subscribeTableId);
  if (!marker) {
    throw new Error(
      `Expected dev Baserow database ${databaseId} to contain subscribe table ${subscribeTableId}. ` +
        "Check BASEROW_TABLE_ID in .env — local dev uses the same database as gwenda-staging.",
    );
  }
  console.log(
    `Dev database ${databaseId} (subscribe table "${marker.name}" id ${subscribeTableId}).`,
  );
  return tables;
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
  const databaseId = DEV_BASEROW_DATABASE_ID;
  const subscribeTableId = readEnv("BASEROW_TABLE_ID") || DEV_SUBSCRIBE_TABLE_ID;
  const tableName = readEnv("BASEROW_RSVP_TABLE_NAME") || RSVP_TABLE_NAME;
  const apiBase = (readEnv("BASEROW_API_URL") || DEFAULT_BASEROW_API).replace(/\/$/, "");

  const { email, password } = await promptCredentials(databaseId);

  console.log(`Authenticating with Baserow (${apiBase})…`);
  const jwt = await fetchJwt(apiBase, email, password);

  console.log(`Table "${tableName}"…`);
  const tables = await loadDevDatabaseTables(
    apiBase,
    jwt,
    databaseId,
    subscribeTableId,
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
  console.log("Next:");
  console.log("  1. Create a database token (Settings → Database tokens) with CRUD on this table.");
  console.log("  2. Set BASEROW_API_KEY in .env (same token works for dev + staging).");
  console.log(`  3. Set BASEROW_RSVP_GRID_URL=${gridUrl} in repo-root .env`);
  console.log("");
  console.log("Runtime code resolves the table by name — no table id in .env.");
  console.log("Production: duplicate the table in the prod Baserow database when you promote.");
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
