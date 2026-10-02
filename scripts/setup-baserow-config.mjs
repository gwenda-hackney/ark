#!/usr/bin/env node
/**
 * Create or repair an environment's Baserow "Gwenda Config" database:
 * production's in the Gwenda workspace, dev's in Gwenda Dev. Each has its own
 * token, so dev can't change production's settings. See shared/config.js (the
 * config service) for how settings resolve. Additive only (safe before a
 * deploy): removing rows the running code may still read happens after the
 * deploy (migrations/config-retired-settings.mjs).
 *
 *   npm run setup:baserow-config -- --env dev            # database, table, fields, seed rows
 *   npm run setup:baserow-config -- --env dev --token    # also mint BASEROW_CONFIG_API_KEY__DEV → SM
 *   npm run setup:baserow-config -- --env production --token
 *
 * Seeding only adds missing Name/Env/Service rows. It never overwrites edits.
 * Logs in to Baserow as that environment's BASEROW_JWT_EMAIL (from SM).
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseDotEnv } from "../shared/env-file.js";
import {
  CONFIG_DATABASE_NAME,
  CONFIG_ENVS,
  CONFIG_TABLE_NAME,
  SETTINGS,
} from "../shared/config.js";
import { getBaserowJwt } from "./lib/baserow-jwt.mjs";
import {
  listAllSmSecrets,
  productionSecretValues,
  resolveSecretsForEnv,
  resolveSmAccessToken,
  upsertSmSecret,
} from "./lib/bitwarden-sm.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const API = (process.env.BASEROW_API_URL || "https://api.baserow.io").replace(/\/$/, "");
/** Each environment's workspace, found by name. */
const WORKSPACES = { production: "Gwenda", dev: "Gwenda Dev" };
const envArg = process.argv.indexOf("--env");
const TARGET = envArg > 0 ? process.argv[envArg + 1] : "";
if (!WORKSPACES[TARGET]) {
  console.error("Usage: setup-baserow-config.mjs --env dev|production [--token]");
  process.exit(2);
}
const WORKSPACE_NAME = WORKSPACES[TARGET];
const SM_KEY = `BASEROW_CONFIG_API_KEY__${TARGET.toUpperCase()}`;

async function workspaceId(jwt) {
  const workspaces = await request(jwt, "/api/workspaces/");
  const found = (workspaces || []).find((ws) => ws.name === WORKSPACE_NAME);
  if (!found) throw new Error(`Baserow workspace "${WORKSPACE_NAME}" not found.`);
  return found.id;
}

/** Every hosted non-prod site. A developer's machine uses FORMS_NOTIFY_EMAIL from .env. */
const NONPROD_NOTIFY = "alerts@gwenda.co.uk";

/** [Name, Value, Env, Service, Notes]; each database gets the rows for all and its own env. */
const SEED_ROWS = [
  ["pour_target.cocktail", "20", "all", "ops", "House pour-cost % of selling price"],
  ["pour_target.pour", "18", "all", "ops", ""],
  ["pour_target.beer", "22", "all", "ops", ""],
  ["pour_target.packaged", "25", "all", "ops", ""],
  ["sanity.project_id", "pn5yjro6", "all", "all", ""],
  ["sanity.project_id", "gwscpagy", "dev", "all", "Gwenda Dev copy"],
  ["forms.notify_email", NONPROD_NOTIFY, "dev", "web", "Form notifications outside production"],
];



/** Settings rows use all + the env; machine state also uses a site's name (preview). */
const ENV_OPTIONS = ["all", ...CONFIG_ENVS, "preview"];

const SELECT = (values) =>
  values.map((value, i) => ({
    value,
    color: ["dark-gray", "blue", "orange", "green", "purple", "light-blue"][i % 6],
  }));

const FIELDS = [
  { name: "Value", type: "long_text" },
  { name: "Env", type: "single_select", select_options: SELECT(ENV_OPTIONS) },
  { name: "Service", type: "single_select", select_options: SELECT(["all", "ops", "web"]) },
  { name: "Notes", type: "long_text" },
];

function loadRootEnv() {
  const path = resolve(ROOT, ".env");
  if (!existsSync(path)) return;
  for (const [key, value] of parseDotEnv(readFileSync(path, "utf8"))) {
    if (!process.env[key]) process.env[key] = value;
  }
}

async function request(jwt, path, init = {}) {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `JWT ${jwt}`, "Content-Type": "application/json" },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`${init.method || "GET"} ${path} → ${response.status}: ${JSON.stringify(body)}`);
  }
  return body;
}

async function findOrCreateDatabase(jwt) {
  const workspace = await workspaceId(jwt);
  const apps = await request(jwt, `/api/applications/workspace/${workspace}/`);
  const found = apps.find((app) => app.type === "database" && app.name === CONFIG_DATABASE_NAME);
  if (found) return found;
  console.log(`+ database ${CONFIG_DATABASE_NAME}`);
  return request(jwt, `/api/applications/workspace/${workspace}/`, {
    method: "POST",
    body: JSON.stringify({ type: "database", name: CONFIG_DATABASE_NAME }),
  });
}

async function findOrCreateTable(jwt, databaseId) {
  const tables = await request(jwt, `/api/database/tables/database/${databaseId}/`);
  const found = tables.find((table) => table.name === CONFIG_TABLE_NAME);
  if (found) return found;
  console.log(`+ table ${CONFIG_TABLE_NAME}`);
  return request(jwt, `/api/database/tables/database/${databaseId}/`, {
    method: "POST",
    body: JSON.stringify({ name: CONFIG_TABLE_NAME, data: [["Name"]], first_row_header: true }),
  });
}

async function ensureFields(jwt, tableId) {
  const existing = await request(jwt, `/api/database/fields/table/${tableId}/`);
  const names = new Set(existing.map((field) => field.name));
  for (const field of FIELDS) {
    if (names.has(field.name)) continue;
    console.log(`+ field ${field.name}`);
    await request(jwt, `/api/database/fields/table/${tableId}/`, {
      method: "POST",
      body: JSON.stringify(field),
    });
  }
}

/** Add any missing Env choice. */
async function ensureEnvOptions(jwt, tableId) {
  const fields = await request(jwt, `/api/database/fields/table/${tableId}/`);
  const field = fields.find((row) => row.name === "Env");
  if (!field) return;
  let changed = false;
  const options = [...field.select_options];
  for (const value of ENV_OPTIONS) {
    if (options.some((option) => option.value === value)) continue;
    changed = true;
    console.log(`+ Env option ${value}`);
    options.push({ value, color: "light-blue" });
  }
  if (!changed) return;
  await request(jwt, `/api/database/fields/${field.id}/`, {
    method: "PATCH",
    body: JSON.stringify({ select_options: options }),
  });
}

async function listRows(jwt, tableId) {
  const body = await request(jwt, `/api/database/rows/table/${tableId}/?user_field_names=true&size=200`);
  return body.results || [];
}

async function seedRows(jwt, tableId) {
  const rows = await listRows(jwt, tableId);
  const have = new Set(
    rows.map((row) => `${row.Name}|${row.Env?.value || "all"}|${row.Service?.value || "all"}`),
  );
  for (const [Name, Value, Env, Service, Notes] of SEED_ROWS) {
    if (Env !== "all" && Env !== TARGET) continue;
    if (have.has(`${Name}|${Env}|${Service}`)) continue;
    console.log(`+ ${Name} (${Env}/${Service})`);
    await request(jwt, `/api/database/rows/table/${tableId}/?user_field_names=true`, {
      method: "POST",
      body: JSON.stringify({ Name, Value, Env, Service, Notes }),
    });
  }
}

async function mintToken(jwt, databaseId) {
  const accessToken = resolveSmAccessToken();
  if (!accessToken) throw new Error("Run bw-unlock to store the token in SM.");
  if (listAllSmSecrets({ accessToken }).get(SM_KEY)) {
    console.log(`SM already has ${SM_KEY}. Delete it first to rotate.`);
    return;
  }
  const token = await request(jwt, "/api/database/tokens/", {
    method: "POST",
    body: JSON.stringify({ name: SM_KEY, workspace: await workspaceId(jwt) }),
  });
  const scoped = [["database", Number(databaseId)]];
  await request(jwt, `/api/database/tokens/${token.id}/`, {
    method: "PATCH",
    body: JSON.stringify({
      permissions: { create: scoped, read: scoped, update: scoped, delete: scoped },
    }),
  });
  const result = upsertSmSecret({
    key: SM_KEY,
    value: token.key,
    accessToken,
    note: `Baserow token "${SM_KEY}": read/create/update/delete on ${WORKSPACE_NAME} / ${CONFIG_DATABASE_NAME} only.`,
  });
  console.log(`SM ${SM_KEY}: ${result}`);
}

/** Log in as this environment's Baserow user. */
function useEnvLogin() {
  const secrets =
    TARGET === "production" ? productionSecretValues() : resolveSecretsForEnv(listAllSmSecrets(), "dev");
  for (const key of ["BASEROW_JWT_EMAIL", "BASEROW_JWT_PASSWORD"]) {
    const value = secrets.get(key);
    if (value) process.env[key] = value;
  }
}

async function main() {
  loadRootEnv();
  useEnvLogin();
  const jwt = await getBaserowJwt(API, { hint: `${WORKSPACE_NAME} workspace` });
  const database = await findOrCreateDatabase(jwt);
  const table = await findOrCreateTable(jwt, database.id);
  await ensureFields(jwt, table.id);
  await ensureEnvOptions(jwt, table.id);
  await seedRows(jwt, table.id);
  // Keep the service's list of settings honest: every seeded key is known.
  for (const [Name] of SEED_ROWS) {
    if (!SETTINGS[Name]) console.warn(`! ${Name} is seeded but not in shared/config.js SETTINGS`);
  }
  if (process.argv.includes("--token")) await mintToken(jwt, database.id);
  console.log(`${CONFIG_DATABASE_NAME}: https://baserow.io/database/${database.id}/table/${table.id}/`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
