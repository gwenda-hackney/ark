#!/usr/bin/env node
/**
 * One-time clone: production Ops Baserow DB → Free workspace "Gwenda Dev".
 *
 * Creates workspace + database, recreates tables/fields, copies rows with link
 * remapping. File field *values* (e.g. Photo) are skipped (re-fetch later);
 * empty file columns are still created so uploads work on the clone.
 *
 * Requires JWT (schema): BASEROW_JWT_EMAIL/PASSWORD or cached `.baserow-jwt.json`.
 * Source rows: BASEROW_API_KEY with read access to the production Ops DB.
 *
 *   npm run dev:refresh:baserow-ops
 *   npm run dev:refresh:baserow-ops -- --dry-run
 *
 * Env overrides:
 *   BASEROW_OPS_CLONE_SOURCE_ID     source DB (default 556507)
 *   BASEROW_OPS_DEV_WORKSPACE_NAME  (default "Gwenda Dev")
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getBaserowJwt } from "./lib/baserow-jwt.mjs";
import {
  OPS_DATABASE_NAME,
  TABLE_INGREDIENTS,
  TABLE_INVENTORY,
  TABLE_INVENTORY_SUPPLIERS,
  TABLE_ITEMS,
  TABLE_SECTIONS,
  TABLE_SUPPLIERS,
  TABLE_USERS,
} from "../ops/site/functions/_lib/baserow.js";
import { loadRepoEnv } from "./lib/load-env.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_API = "https://api.baserow.io";
const DEFAULT_SOURCE_DB = "556507";
const DEV_WORKSPACE_NAME = "Gwenda Dev";
/** Older clone name; findOrCreate renames it to DEV_WORKSPACE_NAME. */
const LEGACY_DEV_WORKSPACE_NAME = "Gwenda Ops Dev";

/** Create order: parents before children that link to them. */
const TABLE_ORDER = [
  TABLE_SUPPLIERS,
  TABLE_INVENTORY,
  TABLE_INVENTORY_SUPPLIERS,
  TABLE_SECTIONS,
  TABLE_ITEMS,
  TABLE_INGREDIENTS,
  TABLE_USERS,
];

/** Link fields that are reverse relations (created automatically). Skip creating. */
const SKIP_LINK_CREATE = new Set([
  `${TABLE_INVENTORY}|Inventory suppliers`,
  `${TABLE_SUPPLIERS}|Inventory suppliers`,
]);

function readEnv(name, fallback = "") {
  return process.env[name]?.trim() || fallback;
}

function parseArgs(argv) {
  const out = { dryRun: false, force: false };
  for (const arg of argv) {
    if (arg === "--dry-run") out.dryRun = true;
    else if (arg === "--force") out.force = true;
    else if (arg === "--help" || arg === "-h") out.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return out;
}

async function jwtRequest(apiBase, jwt, path, init = {}) {
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
    const detail = json?.detail || json?.error || text.slice(0, 400);
    throw new Error(`${init.method || "GET"} ${path} → ${response.status}: ${detail}`);
  }
  return json;
}

async function tokenRequest(apiBase, apiKey, path, init = {}) {
  const url = path.startsWith("http") ? path : `${apiBase}${path}`;
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Token ${apiKey}`,
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
    const detail = json?.detail || json?.error || text.slice(0, 400);
    throw new Error(`${init.method || "GET"} ${path} → ${response.status}: ${detail}`);
  }
  return json;
}

async function listAllRows(apiBase, apiKey, tableId) {
  const rows = [];
  let page = 1;
  for (;;) {
    const payload = await tokenRequest(
      apiBase,
      apiKey,
      `/api/database/rows/table/${tableId}/?user_field_names=true&size=200&page=${page}`,
    );
    rows.push(...(payload.results || []));
    if (!payload.next) break;
    page += 1;
  }
  return rows;
}

function fieldCreateBody(field, tableIdByOldId) {
  if (field.read_only && field.type !== "text") return null;
  // Create empty file columns; row values are skipped in remapRowPayload.
  if (field.type === "file") {
    return { name: field.name, type: "file" };
  }

  const base = { name: field.name, type: field.type };

  if (field.type === "number") {
    return {
      ...base,
      number_decimal_places: field.number_decimal_places ?? 0,
      number_negative: Boolean(field.number_negative),
    };
  }
  if (field.type === "boolean") {
    return { ...base };
  }
  if (field.type === "single_select" || field.type === "multiple_select") {
    return {
      ...base,
      select_options: (field.select_options || []).map((opt) => ({
        value: opt.value,
        color: opt.color || "light-gray",
      })),
    };
  }
  if (field.type === "link_row") {
    const newTableId = tableIdByOldId.get(String(field.link_row_table_id));
    if (!newTableId) return null;
    const isSelf =
      field.table_id != null &&
      String(field.link_row_table_id) === String(field.table_id);
    return {
      ...base,
      link_row_table_id: Number(newTableId),
      has_related_field: isSelf
        ? false
        : Boolean(field.link_row_related_field_id ?? field.has_related_field),
    };
  }
  if (
    field.type === "text" ||
    field.type === "long_text" ||
    field.type === "url" ||
    field.type === "email" ||
    field.type === "phone_number" ||
    field.type === "rating" ||
    field.type === "date" ||
    field.type === "created_on" ||
    field.type === "last_modified"
  ) {
    if (field.type === "created_on" || field.type === "last_modified") return null;
    return base;
  }
  // Skip formula/lookup/rollup/count — recreate manually if needed.
  if (
    field.type === "formula" ||
    field.type === "lookup" ||
    field.type === "rollup" ||
    field.type === "count"
  ) {
    return null;
  }
  return base;
}

function linkIds(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (item && typeof item === "object" ? item.id : item))
    .filter((id) => id != null)
    .map(String);
}

function remapRowPayload(row, fields, idMapsByOldTableId) {
  const out = {};
  for (const field of fields) {
    if (field.primary && field.name === "Name") {
      out.Name = row.Name ?? row[field.name] ?? "";
      continue;
    }
    if (field.type === "file") continue;
    if (field.read_only && field.type !== "text") continue;
    if (
      field.type === "formula" ||
      field.type === "lookup" ||
      field.type === "rollup" ||
      field.type === "count" ||
      field.type === "created_on" ||
      field.type === "last_modified"
    ) {
      continue;
    }

    const raw = row[field.name];
    if (raw == null || raw === "") continue;

    if (field.type === "link_row") {
      const map = idMapsByOldTableId.get(String(field.link_row_table_id));
      if (!map) continue;
      const next = [];
      for (const oldId of linkIds(raw)) {
        const newId = map.get(oldId);
        if (newId) next.push(Number(newId));
      }
      if (next.length) out[field.name] = next;
      continue;
    }

    if (field.type === "single_select") {
      const value =
        typeof raw === "object" && raw != null ? raw.value : raw;
      if (value != null && value !== "") out[field.name] = value;
      continue;
    }

    if (field.type === "multiple_select") {
      const values = Array.isArray(raw)
        ? raw.map((item) => (typeof item === "object" ? item.value : item))
        : [];
      if (values.length) out[field.name] = values;
      continue;
    }

    out[field.name] = raw;
  }
  return out;
}

async function findOrCreateWorkspace(apiBase, jwt, name, dryRun) {
  const list = await jwtRequest(apiBase, jwt, "/api/workspaces/");
  const workspaces = Array.isArray(list) ? list : [];
  const norm = (n) => String(n).trim().toLowerCase();
  const existing = workspaces.find((ws) => norm(ws.name) === norm(name));
  if (existing) {
    console.log(`Using existing workspace "${existing.name}" (${existing.id}).`);
    return String(existing.id);
  }
  const legacy = workspaces.find(
    (ws) => norm(ws.name) === norm(LEGACY_DEV_WORKSPACE_NAME),
  );
  if (legacy) {
    if (dryRun) {
      console.log(
        `[dry-run] would rename workspace "${legacy.name}" → "${name}" (${legacy.id})`,
      );
      return String(legacy.id);
    }
    const renamed = await jwtRequest(apiBase, jwt, `/api/workspaces/${legacy.id}/`, {
      method: "PATCH",
      body: JSON.stringify({ name }),
    });
    console.log(
      `Renamed workspace "${legacy.name}" → "${renamed.name}" (${renamed.id}).`,
    );
    return String(renamed.id);
  }
  if (dryRun) {
    console.log(`[dry-run] would create workspace "${name}"`);
    return "dry-run-workspace";
  }
  const created = await jwtRequest(apiBase, jwt, "/api/workspaces/", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
  console.log(`Created workspace "${created.name}" (${created.id}).`);
  return String(created.id);
}

async function findOrCreateDatabase(apiBase, jwt, workspaceId, name, dryRun) {
  if (dryRun) {
    console.log(`[dry-run] would create database "${name}" in workspace ${workspaceId}`);
    return "dry-run-database";
  }
  const apps = await jwtRequest(
    apiBase,
    jwt,
    `/api/applications/workspace/${workspaceId}/`,
  );
  const list = Array.isArray(apps) ? apps : [];
  const existing = list.find(
    (app) => app.type === "database" && app.name === name,
  );
  if (existing) {
    console.log(`Using existing database "${name}" (${existing.id}).`);
    return String(existing.id);
  }
  const created = await jwtRequest(
    apiBase,
    jwt,
    `/api/applications/workspace/${workspaceId}/`,
    {
      method: "POST",
      body: JSON.stringify({ name, type: "database" }),
    },
  );
  console.log(`Created database "${name}" (${created.id}).`);
  return String(created.id);
}

function writeLocalDevHints({ workspaceId, databaseId }) {
  const opsEnvPath = resolve(ROOT, ".env");
  const lines = [
    "",
    `# Set after dev:refresh:baserow-ops (${new Date().toISOString().slice(0, 10)})`,
    `BASEROW_OPS_DATABASE_ID=${databaseId}`,
    `BASEROW_OPS_DEV_WORKSPACE_ID=${workspaceId}`,
  ];
  if (existsSync(opsEnvPath)) {
    let text = readFileSync(opsEnvPath, "utf8");
    for (const key of ["BASEROW_OPS_DATABASE_ID", "BASEROW_OPS_DEV_WORKSPACE_ID"]) {
      const re = new RegExp(`^${key}=.*$`, "m");
      const value = key === "BASEROW_OPS_DATABASE_ID" ? databaseId : workspaceId;
      if (re.test(text)) text = text.replace(re, `${key}=${value}`);
      else text = `${text.trimEnd()}\n${key}=${value}\n`;
    }
    writeFileSync(opsEnvPath, text.endsWith("\n") ? text : `${text}\n`);
    console.log(`Updated ${opsEnvPath} with BASEROW_OPS_DATABASE_ID=${databaseId}`);
  } else {
    writeFileSync(
      opsEnvPath,
      `# Local Ops DB id (from clone)\nBASEROW_OPS_DATABASE_ID=${databaseId}\nBASEROW_OPS_DEV_WORKSPACE_ID=${workspaceId}\n`,
    );
    console.log(`Wrote ${opsEnvPath}`);
  }

  writeFileSync(
    resolve(ROOT, ".baserow-ops-dev.json"),
    `${JSON.stringify(
      {
        workspaceId,
        databaseId,
        workspaceName: DEV_WORKSPACE_NAME,
        databaseName: OPS_DATABASE_NAME,
        sourceDatabaseId: readEnv("BASEROW_OPS_CLONE_SOURCE_ID", DEFAULT_SOURCE_DB),
        clonedAt: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
  );
  console.log("Wrote .baserow-ops-dev.json");
}

async function main() {
  loadRepoEnv({ app: "ops" });
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log(`Usage: node scripts/clone-baserow-ops-db.mjs [--dry-run] [--force]`);
    return;
  }

  const apiBase = readEnv("BASEROW_API_URL", DEFAULT_API).replace(/\/$/, "");
  const sourceDbId = readEnv("BASEROW_OPS_CLONE_SOURCE_ID", DEFAULT_SOURCE_DB);
  // Prefer explicit source; do not use BASEROW_OPS_DATABASE_ID if already pointed at a clone.
  const apiKey = readEnv("BASEROW_API_KEY");
  if (!apiKey) throw new Error("BASEROW_API_KEY is required to read the source database.");

  const workspaceName = readEnv(
    "BASEROW_OPS_DEV_WORKSPACE_NAME",
    DEV_WORKSPACE_NAME,
  );

  console.log(`Source Ops database: ${sourceDbId}`);
  console.log(`Target workspace name: ${workspaceName}`);
  if (opts.dryRun) console.log("Dry run (no writes).\n");

  const jwt = await getBaserowJwt(apiBase);

  const sourceTables = await jwtRequest(
    apiBase,
    jwt,
    `/api/database/tables/database/${sourceDbId}/`,
  );
  const byName = new Map(sourceTables.map((t) => [t.name, t]));
  for (const name of TABLE_ORDER) {
    if (!byName.has(name)) {
      throw new Error(`Source DB ${sourceDbId} missing table "${name}".`);
    }
  }

  const sourceFieldsByTable = new Map();
  for (const name of TABLE_ORDER) {
    const table = byName.get(name);
    const fields = await jwtRequest(
      apiBase,
      jwt,
      `/api/database/fields/table/${table.id}/`,
    );
    sourceFieldsByTable.set(name, fields);
  }

  if (opts.dryRun) {
    console.log("Would clone tables:");
    for (const name of TABLE_ORDER) {
      const fields = sourceFieldsByTable.get(name) || [];
      console.log(`  ${name} (${fields.length} fields)`);
    }
    return;
  }

  const workspaceId = await findOrCreateWorkspace(
    apiBase,
    jwt,
    workspaceName,
    false,
  );
  const databaseId = await findOrCreateDatabase(
    apiBase,
    jwt,
    workspaceId,
    OPS_DATABASE_NAME,
    false,
  );

  // Create tables
  let destTables = await jwtRequest(
    apiBase,
    jwt,
    `/api/database/tables/database/${databaseId}/`,
  );
  const destByName = new Map(destTables.map((t) => [t.name, t]));
  const tableIdByOldId = new Map();

  for (const name of TABLE_ORDER) {
    const source = byName.get(name);
    let dest = destByName.get(name);
    if (!dest) {
      dest = await jwtRequest(
        apiBase,
        jwt,
        `/api/database/tables/database/${databaseId}/`,
        { method: "POST", body: JSON.stringify({ name }) },
      );
      console.log(`Created table "${name}" (${dest.id}).`);
      destTables.push(dest);
      destByName.set(name, dest);
    } else {
      console.log(`Using existing table "${name}" (${dest.id}).`);
    }
    tableIdByOldId.set(String(source.id), String(dest.id));
  }

  // Pass 1: non-link fields
  for (const name of TABLE_ORDER) {
    const source = byName.get(name);
    const dest = destByName.get(name);
    const sourceFields = sourceFieldsByTable.get(name);
    const destFields = await jwtRequest(
      apiBase,
      jwt,
      `/api/database/fields/table/${dest.id}/`,
    );
    const destByFieldName = new Map(destFields.map((f) => [f.name, f]));

    console.log(`Fields (scalars) → ${name}`);
    for (const field of sourceFields) {
      if (field.primary) continue;
      if (field.type === "link_row") continue;
      if (destByFieldName.has(field.name)) {
        console.log(`  ✓ ${field.name}`);
        continue;
      }
      const body = fieldCreateBody(field, tableIdByOldId);
      if (!body) {
        console.log(`  · skip ${field.name} (${field.type})`);
        continue;
      }
      await jwtRequest(apiBase, jwt, `/api/database/fields/table/${dest.id}/`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      console.log(`  + ${field.name}`);
    }
  }

  // Pass 2: link fields (skip known reverse autos)
  for (const name of TABLE_ORDER) {
    const dest = destByName.get(name);
    const sourceFields = sourceFieldsByTable.get(name);
    const destFields = await jwtRequest(
      apiBase,
      jwt,
      `/api/database/fields/table/${dest.id}/`,
    );
    const destByFieldName = new Map(destFields.map((f) => [f.name, f]));

    console.log(`Fields (links) → ${name}`);
    for (const field of sourceFields) {
      if (field.type !== "link_row") continue;
      if (SKIP_LINK_CREATE.has(`${name}|${field.name}`)) {
        console.log(`  · skip reverse ${field.name}`);
        continue;
      }
      if (destByFieldName.has(field.name)) {
        console.log(`  ✓ ${field.name}`);
        continue;
      }
      const body = fieldCreateBody(field, tableIdByOldId);
      if (!body) {
        console.log(`  · skip ${field.name} (unmapped link target)`);
        continue;
      }
      await jwtRequest(apiBase, jwt, `/api/database/fields/table/${dest.id}/`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      console.log(`  + ${field.name}`);
    }
  }

  // Copy rows in TABLE_ORDER; build id maps per source table
  const idMapsByOldTableId = new Map();
  let skippedPhotos = 0;

  for (const name of TABLE_ORDER) {
    const source = byName.get(name);
    const dest = destByName.get(name);
    const sourceFields = sourceFieldsByTable.get(name);
    const rows = await listAllRows(apiBase, apiKey, source.id);
    const idMap = new Map();
    idMapsByOldTableId.set(String(source.id), idMap);

    // Row API with JWT for create (database token may not see new workspace yet)
    console.log(`Rows → ${name} (${rows.length})`);

    const existingCount = (
      await jwtRequest(
        apiBase,
        jwt,
        `/api/database/rows/table/${dest.id}/?user_field_names=true&size=1`,
      )
    ).count;
    if (existingCount > 0) {
      if (!opts.force) {
        throw new Error(
          `Destination table "${name}" already has ${existingCount} rows. Re-run with --force to wipe and re-copy.`,
        );
      }
      console.log(`  wiping ${existingCount} existing row(s) (--force)…`);
      let page = 1;
      for (;;) {
        const batch = await jwtRequest(
          apiBase,
          jwt,
          `/api/database/rows/table/${dest.id}/?user_field_names=true&size=200&page=${page}`,
        );
        const ids = (batch.results || []).map((row) => row.id);
        if (!ids.length) break;
        await jwtRequest(
          apiBase,
          jwt,
          `/api/database/rows/table/${dest.id}/batch-delete/`,
          { method: "POST", body: JSON.stringify({ items: ids }) },
        );
        if (!batch.next) break;
      }
    }

    for (const row of rows) {
      if (Array.isArray(row.Photo) && row.Photo.length) skippedPhotos += 1;
      const payload = remapRowPayload(row, sourceFields, idMapsByOldTableId);
      if (!payload.Name && row.Name) payload.Name = row.Name;
      const created = await jwtRequest(
        apiBase,
        jwt,
        `/api/database/rows/table/${dest.id}/?user_field_names=true`,
        { method: "POST", body: JSON.stringify(payload) },
      );
      idMap.set(String(row.id), String(created.id));
    }
    console.log(`  copied ${rows.length}`);
  }

  writeLocalDevHints({ workspaceId, databaseId });

  console.log(`
Clone complete.

  Workspace:  ${workspaceName}  id=${workspaceId}
  Database:   ${OPS_DATABASE_NAME}  id=${databaseId}
  Source:     ${sourceDbId}

Next:
  1. In Baserow → workspace "${workspaceName}" → Settings → Database tokens:
       Create a token with access ONLY to this Ops database.
  2. Put that token in Secrets Manager as BASEROW_OPS_API_KEY__LOCAL.
  3. The prod-only token for DB ${sourceDbId} is BASEROW_OPS_API_KEY__PRODUCTION
       (Pages: gh workflow run ops-secrets.yml).
  4. npm run env:push       # save the new Ops DB id to the Bitwarden note
  5. Local ops-dev will use BASEROW_OPS_DATABASE_ID=${databaseId}
     Production wrangler keeps ${sourceDbId}.
${skippedPhotos ? `\n  Note: ${skippedPhotos} Photo file(s) were not copied. Re-run fetch:ops-menu-photos on the dev DB if needed.\n` : ""}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
