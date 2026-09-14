#!/usr/bin/env node
/**
 * Create (or repair) the Gwenda Ops Baserow database and menu tables.
 *
 * Database tokens only allow row CRUD. Creating databases/tables/fields needs a
 * short-lived JWT from POST /api/user/token-auth/ (Admin or Builder).
 *
 * Usage:
 *   npm run setup:baserow-ops
 *
 * Prompts for Baserow email + password (not stored). Optional non-interactive:
 *   BASEROW_JWT_EMAIL, BASEROW_JWT_PASSWORD
 *   BASEROW_WORKSPACE_ID   (required to create a new database)
 *   BASEROW_OPS_DATABASE_ID (reuse an existing Ops database)
 */
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

const DEFAULT_BASEROW_API = "https://api.baserow.io";
const OPS_DATABASE_NAME = "Gwenda Ops";
const TABLE_SECTIONS = "Menu Sections";
const TABLE_ITEMS = "Menu Items";
const TABLE_INGREDIENTS = "Ingredients";

const RECIPE_UNITS = [
  "ml",
  "cl",
  "dash",
  "barspoon",
  "drop",
  "splash",
  "each",
  "slice",
  "wedge",
  "sprig",
  "top",
  "pinch",
  "tsp",
  "tbsp",
];

function readEnv(name) {
  return process.env[name]?.trim() || "";
}

function promptHidden(question) {
  return new Promise((resolve) => {
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

async function promptCredentials() {
  let email = readEnv("BASEROW_JWT_EMAIL");
  let password = readEnv("BASEROW_JWT_PASSWORD");
  if (email && password) return { email, password };

  if (!stdin.isTTY) {
    throw new Error(
      "Set BASEROW_JWT_EMAIL and BASEROW_JWT_PASSWORD for non-interactive use.",
    );
  }

  console.log("Log in with your Baserow account (Admin or Builder).");
  console.log("Credentials are not saved — used once for a short-lived JWT.\n");

  const rl = createInterface({ input: stdin, output: stdout });
  try {
    if (!email) email = (await rl.question("Baserow email: ")).trim();
  } finally {
    rl.close();
  }
  if (!password) password = await promptHidden("Baserow password: ");
  if (!email || !password) throw new Error("Email and password are required.");
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
  if (!token) throw new Error("Baserow login succeeded but no access_token.");
  return token;
}

async function listWorkspaces(apiBase, jwt) {
  const payload = await baserowRequest(apiBase, jwt, "/api/workspaces/");
  return Array.isArray(payload) ? payload : payload?.workspaces || [];
}

async function resolveWorkspaceId(apiBase, jwt) {
  const configured = readEnv("BASEROW_WORKSPACE_ID");
  if (configured) {
    console.log(`Using BASEROW_WORKSPACE_ID=${configured}`);
    return configured;
  }

  const workspaces = await listWorkspaces(apiBase, jwt);
  if (workspaces.length === 0) {
    throw new Error("No Baserow workspaces visible for this account.");
  }

  console.log("Workspaces:");
  for (const workspace of workspaces) {
    console.log(`  ${workspace.id}  ${workspace.name}`);
  }

  if (workspaces.length === 1) {
    console.log(`Using only workspace: ${workspaces[0].name} (${workspaces[0].id})`);
    return String(workspaces[0].id);
  }

  const preferred = workspaces.find(
    (workspace) => String(workspace.name).trim().toLowerCase() === "gwenda",
  );
  if (preferred) {
    console.log(`Using Gwenda workspace (${preferred.id})`);
    return String(preferred.id);
  }

  if (!stdin.isTTY) {
    throw new Error(
      `Multiple workspaces. Set BASEROW_WORKSPACE_ID to one of: ${workspaces
        .map((workspace) => workspace.id)
        .join(", ")}`,
    );
  }

  const rl = createInterface({ input: stdin, output: stdout });
  let chosen;
  try {
    chosen = (await rl.question("Workspace id to use: ")).trim();
  } finally {
    rl.close();
  }
  if (!workspaces.some((workspace) => String(workspace.id) === chosen)) {
    throw new Error(`Unknown workspace id: ${chosen}`);
  }
  return chosen;
}

async function findOrCreateOpsDatabase(apiBase, jwt) {
  const existingId = readEnv("BASEROW_OPS_DATABASE_ID");
  if (existingId) {
    console.log(`Using BASEROW_OPS_DATABASE_ID=${existingId}`);
    return existingId;
  }

  const workspaceId = await resolveWorkspaceId(apiBase, jwt);
  const apps = await baserowRequest(
    apiBase,
    jwt,
    `/api/applications/workspace/${workspaceId}/`,
  );
  const list = Array.isArray(apps) ? apps : [];
  const existing = list.find(
    (app) => app.type === "database" && app.name === OPS_DATABASE_NAME,
  );
  if (existing) {
    console.log(`Using existing database "${OPS_DATABASE_NAME}" (id ${existing.id}).`);
    return String(existing.id);
  }

  const created = await baserowRequest(
    apiBase,
    jwt,
    `/api/applications/workspace/${workspaceId}/`,
    {
      method: "POST",
      body: JSON.stringify({ name: OPS_DATABASE_NAME, type: "database" }),
    },
  );
  console.log(`Created database "${OPS_DATABASE_NAME}" (id ${created.id}).`);
  return String(created.id);
}

async function findOrCreateTable(apiBase, jwt, databaseId, tables, tableName) {
  const existing = tables.find((table) => table.name === tableName);
  if (existing) {
    console.log(`Using existing table "${tableName}" (id ${existing.id}).`);
    return existing;
  }
  const created = await baserowRequest(
    apiBase,
    jwt,
    `/api/database/tables/database/${databaseId}/`,
    { method: "POST", body: JSON.stringify({ name: tableName }) },
  );
  console.log(`Created table "${tableName}" (id ${created.id}).`);
  tables.push(created);
  return created;
}

async function ensureFields(apiBase, jwt, tableId, expectedFields) {
  const fields = await baserowRequest(
    apiBase,
    jwt,
    `/api/database/fields/table/${tableId}/`,
  );
  const byName = new Map(fields.map((field) => [field.name, field]));
  for (const expected of expectedFields) {
    if (byName.has(expected.name)) {
      console.log(`  ✓ ${expected.name}`);
      continue;
    }
    const body =
      typeof expected.body === "function"
        ? expected.body(byName)
        : expected.body;
    if (!body) {
      console.log(`  · skip ${expected.name} (dependency missing)`);
      continue;
    }
    await baserowRequest(apiBase, jwt, `/api/database/fields/table/${tableId}/`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    console.log(`  + ${expected.name}`);
  }
}

function sectionFields(sectionsTableId) {
  return [
    { name: "Slug", body: { name: "Slug", type: "text" } },
    { name: "Subtitle", body: { name: "Subtitle", type: "text" } },
    {
      name: "Parent",
      body: {
        name: "Parent",
        type: "link_row",
        link_row_table_id: sectionsTableId,
        has_related_field: false,
      },
    },
    {
      name: "Order",
      body: {
        name: "Order",
        type: "number",
        number_decimal_places: 0,
        number_negative: false,
      },
    },
    { name: "Sanity ID", body: { name: "Sanity ID", type: "text" } },
  ];
}

function itemFields(sectionsTableId) {
  return [
    {
      name: "Section",
      body: {
        name: "Section",
        type: "link_row",
        link_row_table_id: sectionsTableId,
        has_related_field: false,
      },
    },
    { name: "Menu line", body: { name: "Menu line", type: "long_text" } },
    { name: "Lock menu line", body: { name: "Lock menu line", type: "boolean" } },
    { name: "Price", body: { name: "Price", type: "text" } },
    { name: "Type", body: { name: "Type", type: "text" } },
    { name: "Glassware", body: { name: "Glassware", type: "text" } },
    { name: "Garnish", body: { name: "Garnish", type: "text" } },
    { name: "Ice", body: { name: "Ice", type: "text" } },
    { name: "Method", body: { name: "Method", type: "long_text" } },
    { name: "Signature", body: { name: "Signature", type: "boolean" } },
    { name: "ABV", body: { name: "ABV", type: "text" } },
    { name: "Volume", body: { name: "Volume", type: "text" } },
    { name: "Producer", body: { name: "Producer", type: "text" } },
    { name: "Photo", body: { name: "Photo", type: "file" } },
    {
      name: "Order",
      body: {
        name: "Order",
        type: "number",
        number_decimal_places: 0,
        number_negative: false,
      },
    },
    { name: "Sanity ID", body: { name: "Sanity ID", type: "text" } },
    {
      name: "On digital menu",
      body: { name: "On digital menu", type: "boolean" },
    },
  ];
}

function ingredientFields(itemsTableId) {
  return [
    {
      name: "Menu Item",
      body: {
        name: "Menu Item",
        type: "link_row",
        link_row_table_id: itemsTableId,
        has_related_field: false,
      },
    },
    {
      name: "Qty",
      body: {
        name: "Qty",
        type: "number",
        number_decimal_places: 2,
        number_negative: false,
      },
    },
    {
      name: "Unit",
      body: {
        name: "Unit",
        type: "single_select",
        select_options: RECIPE_UNITS.map((value, index) => ({
          value,
          color: ["blue", "green", "orange", "purple", "cyan"][index % 5],
        })),
      },
    },
    { name: "Note", body: { name: "Note", type: "text" } },
    {
      name: "Order",
      body: {
        name: "Order",
        type: "number",
        number_decimal_places: 0,
        number_negative: false,
      },
    },
  ];
}

async function main() {
  const apiBase = (readEnv("BASEROW_API_URL") || DEFAULT_BASEROW_API).replace(/\/$/, "");
  const { email, password } = await promptCredentials();
  console.log(`Authenticating with Baserow (${apiBase})…`);
  const jwt = await fetchJwt(apiBase, email, password);

  const databaseId = await findOrCreateOpsDatabase(apiBase, jwt);
  let tables = await baserowRequest(
    apiBase,
    jwt,
    `/api/database/tables/database/${databaseId}/`,
  );

  const sections = await findOrCreateTable(
    apiBase,
    jwt,
    databaseId,
    tables,
    TABLE_SECTIONS,
  );
  const items = await findOrCreateTable(apiBase, jwt, databaseId, tables, TABLE_ITEMS);
  const ingredients = await findOrCreateTable(
    apiBase,
    jwt,
    databaseId,
    tables,
    TABLE_INGREDIENTS,
  );

  console.log(`Fields on ${TABLE_SECTIONS}:`);
  await ensureFields(apiBase, jwt, sections.id, sectionFields(sections.id));
  console.log(`Fields on ${TABLE_ITEMS}:`);
  await ensureFields(apiBase, jwt, items.id, itemFields(sections.id));
  console.log(`Fields on ${TABLE_INGREDIENTS}:`);
  await ensureFields(apiBase, jwt, ingredients.id, ingredientFields(items.id));

  console.log("");
  console.log("Gwenda Ops menu tables ready.");
  console.log(`Database: https://baserow.io/database/${databaseId}/`);
  console.log(`  ${TABLE_SECTIONS} → ${sections.id}`);
  console.log(`  ${TABLE_ITEMS} → ${items.id}`);
  console.log(`  ${TABLE_INGREDIENTS} → ${ingredients.id}`);
  console.log("");

  const envLines = [
    `BASEROW_OPS_DATABASE_ID=${databaseId}`,
    `BASEROW_OPS_SECTIONS_TABLE_ID=${sections.id}`,
    `BASEROW_OPS_ITEMS_TABLE_ID=${items.id}`,
    `BASEROW_OPS_INGREDIENTS_TABLE_ID=${ingredients.id}`,
  ];
  await maybeWriteEnv(envLines);

  console.log("Next: npm run setup:ops  (pushes Baserow + deploy secrets to gwenda-ops Pages)");
}

async function maybeWriteEnv(lines) {
  const { readFileSync, writeFileSync, existsSync } = await import("node:fs");
  const { resolve } = await import("node:path");
  const envPath = resolve(process.cwd(), ".env");
  if (!existsSync(envPath)) {
    console.log("Add to repo-root .env:");
    for (const line of lines) console.log(`  ${line}`);
    return;
  }

  let text = readFileSync(envPath, "utf8");
  let changed = false;
  for (const line of lines) {
    const [key, value] = line.split("=");
    const pattern = new RegExp(`^${key}=.*$`, "m");
    if (pattern.test(text)) {
      const current = text.match(pattern)?.[0]?.slice(key.length + 1) || "";
      if (!current.trim()) {
        text = text.replace(pattern, `${key}=${value}`);
        changed = true;
      } else if (current.trim() !== value) {
        console.log(`Keeping existing ${key}=${current.trim()} (new value would be ${value})`);
      }
    } else {
      if (!text.endsWith("\n")) text += "\n";
      text += `${key}=${value}\n`;
      changed = true;
    }
  }
  if (changed) {
    writeFileSync(envPath, text);
    console.log(`Wrote Baserow Ops ids into ${envPath}`);
  } else {
    console.log("Baserow Ops ids already present in .env");
  }
  for (const line of lines) console.log(`  ${line}`);

  await maybeSyncBitwarden(lines);
}

async function maybeSyncBitwarden(lines) {
  try {
    const {
      ensureBwInstalled,
      ensureServer,
      ensureSession,
      syncVault,
      getItemOrNull,
      upsertDotEnvKey,
      updateItemNotes,
      DEFAULT_LOCAL_ITEM,
    } = await import("./lib/bitwarden-env.mjs");

    ensureBwInstalled();
    ensureServer();
    ensureSession();
    syncVault();

    const item = getItemOrNull(DEFAULT_LOCAL_ITEM);
    if (!item) {
      console.log(
        `Bitwarden item "${DEFAULT_LOCAL_ITEM}" missing. Run: npm run env:seed`,
      );
      return;
    }

    let notes = item.notes || "";
    for (const line of lines) {
      const eq = line.indexOf("=");
      const key = line.slice(0, eq);
      const value = line.slice(eq + 1);
      notes = upsertDotEnvKey(notes, key, value);
    }
    updateItemNotes(item, notes);
    console.log(`Updated Bitwarden ${DEFAULT_LOCAL_ITEM} with Baserow Ops ids.`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log("");
    console.log("Bitwarden not updated (local .env only):");
    console.log(`  ${message.split("\n")[0]}`);
    console.log("After unlock, sync with:");
    for (const line of lines) {
      const eq = line.indexOf("=");
      const key = line.slice(0, eq);
      const value = line.slice(eq + 1);
      console.log(`  npm run env:set -- ${key} '${value}'`);
    }
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
