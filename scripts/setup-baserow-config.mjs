#!/usr/bin/env node
/**
 * Create or repair the Baserow "Gwenda Config" database (workspace Gwenda).
 * See shared/config.js (the config service) for how settings resolve.
 * Additive only (safe before a deploy): removing rows the running code may
 * still read happens after the deploy (migrations/config-retired-settings.mjs).
 *
 *   npm run setup:baserow-config            # database, table, fields, seed rows
 *   npm run setup:baserow-config -- --token # also mint BASEROW_CONFIG_API_KEY → SM (Ark)
 *
 * Seeding only adds missing Name/Env/Service rows. It never overwrites edits.
 * Needs a Baserow user JWT (cached in .baserow-jwt.json).
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
import { listAllSmSecrets, resolveSmAccessToken, upsertSmSecret } from "./lib/bitwarden-sm.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const API = (process.env.BASEROW_API_URL || "https://api.baserow.io").replace(/\/$/, "");
/** Paid Gwenda workspace (production data lives here too), found by name. */
const WORKSPACE_NAME = "Gwenda";

async function workspaceId(jwt) {
  const workspaces = await request(jwt, "/api/workspaces/");
  const found = (workspaces || []).find((ws) => ws.name === WORKSPACE_NAME);
  if (!found) throw new Error(`Baserow workspace "${WORKSPACE_NAME}" not found.`);
  return found.id;
}
const TOKEN_NAME = "gwenda-config";

/** Every hosted non-prod site. A developer's machine uses FORMS_NOTIFY_EMAIL from .env. */
const NONPROD_NOTIFY = "alerts@gwenda.co.uk";

/** [Name, Value, Env, Service, Notes] */
const SEED_ROWS = [
  ["pour_target.cocktail", "20", "all", "ops", "House pour-cost % of selling price"],
  ["pour_target.pour", "18", "all", "ops", ""],
  ["pour_target.beer", "22", "all", "ops", ""],
  ["pour_target.packaged", "25", "all", "ops", ""],
  ["sanity.project_id", "pn5yjro6", "all", "all", ""],
  ["sanity.project_id", "gwscpagy", "dev", "all", "Gwenda Dev copy"],
  ["forms.notify_email", NONPROD_NOTIFY, "dev", "web", "Form notifications outside production"],
];



const SELECT = (values) =>
  values.map((value, i) => ({
    value,
    color: ["dark-gray", "blue", "orange", "green", "purple", "light-blue"][i % 6],
  }));

const FIELDS = [
  { name: "Value", type: "long_text" },
  { name: "Env", type: "single_select", select_options: SELECT(["all", ...CONFIG_ENVS]) },
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

/**
 * Env choices are all + CONFIG_ENVS. The old "local" choice is renamed to
 * "dev" in place, so its rows keep their values (a developer's own values
 * live in their .env, not here).
 */
async function ensureEnvOptions(jwt, tableId) {
  const fields = await request(jwt, `/api/database/fields/table/${tableId}/`);
  const field = fields.find((row) => row.name === "Env");
  if (!field) return;
  const wanted = ["all", ...CONFIG_ENVS];
  let changed = false;
  const options = field.select_options.map((option) => {
    if (option.value === "local" && !field.select_options.some((o) => o.value === "dev")) {
      changed = true;
      console.log("~ Env option local → dev");
      return { ...option, value: "dev" };
    }
    return option;
  });
  for (const value of wanted) {
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
  if (listAllSmSecrets({ accessToken }).get("BASEROW_CONFIG_API_KEY")) {
    console.log("SM already has BASEROW_CONFIG_API_KEY. Delete it first to rotate.");
    return;
  }
  const token = await request(jwt, "/api/database/tokens/", {
    method: "POST",
    body: JSON.stringify({ name: TOKEN_NAME, workspace: await workspaceId(jwt) }),
  });
  const scoped = [["database", Number(databaseId)]];
  await request(jwt, `/api/database/tokens/${token.id}/`, {
    method: "PATCH",
    body: JSON.stringify({
      permissions: { create: scoped, read: scoped, update: scoped, delete: scoped },
    }),
  });
  const result = upsertSmSecret({
    key: "BASEROW_CONFIG_API_KEY",
    value: token.key,
    accessToken,
    note: `Baserow token "${TOKEN_NAME}": read/create/update/delete on ${CONFIG_DATABASE_NAME} only. All envs.`,
  });
  console.log(`SM BASEROW_CONFIG_API_KEY: ${result}`);
}

async function main() {
  loadRootEnv();
  const jwt = await getBaserowJwt(API, { hint: "Gwenda workspace" });
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
