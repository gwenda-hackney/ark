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
 * Credentials (not stored):
 *   BASEROW_JWT_EMAIL, BASEROW_JWT_PASSWORD
 *   or interactive prompt when stdin is a TTY
 *
 * After success, set BASEROW_SYNC_LOG_TABLE_ID in
 * marketing/subscribe-mailchimp-sync/wrangler.toml [vars] and redeploy.
 */
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ENV_PATH = resolve(ROOT, ".env");
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

function loadDotEnv() {
  if (!existsSync(ENV_PATH)) return;
  for (const line of readFileSync(ENV_PATH, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function readEnv(key) {
  return process.env[key]?.trim() || "";
}

function promptHidden(label) {
  return new Promise((resolvePromise, reject) => {
    if (!stdin.isTTY) {
      reject(new Error("Cannot prompt for password without a TTY."));
      return;
    }
    stdout.write(label);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    let password = "";

    const onData = (chunk) => {
      const char = String(chunk);
      if (char === "\n" || char === "\r" || char === "\u0004") {
        stdin.setRawMode(false);
        stdin.pause();
        stdin.removeListener("data", onData);
        stdout.write("\n");
        resolvePromise(password);
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
    throw new Error(
      `${init.method || "GET"} ${path} → ${response.status}: ${detail}`,
    );
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

async function main() {
  loadDotEnv();

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
  const apiKey = readEnv("BASEROW_API_KEY");
  if (!apiKey) {
    throw new Error("BASEROW_API_KEY is required (resolves prod database id).");
  }

  const databaseId = await resolveProductionDatabaseId(apiBase, apiKey);
  console.log(
    `Production database ${databaseId} (subscribe table ${PRODUCTION_SUBSCRIBE_TABLE_ID}).`,
  );

  const { email, password } = await promptCredentials(databaseId);
  console.log(`Authenticating with Baserow (${apiBase})…`);
  const jwt = await fetchJwt(apiBase, email, password);

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
