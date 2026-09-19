#!/usr/bin/env node
/**
 * One-time clone: staging website Baserow DB → Free workspace "Gwenda Dev".
 *
 * Recreates every table/field, copies rows with link remapping. File field
 * values are skipped; empty file columns are still created.
 *
 * Requires JWT (schema): BASEROW_JWT_EMAIL/PASSWORD or cached `.baserow-jwt.json`.
 * Source rows use the same JWT (must see database 465058 in workspace Gwenda).
 *
 *   npm run clone:baserow-web-dev
 *   npm run clone:baserow-web-dev -- --dry-run
 *
 * Destination database is always named Website (same as production).
 *
 * Env overrides:
 *   BASEROW_WEB_CLONE_SOURCE_ID     source DB (default 465058)
 *   BASEROW_WEB_DEV_WORKSPACE_NAME  (default "Gwenda Dev")
 *   BASEROW_WEB_DEV_WORKSPACE_ID    (default from .baserow-ops-dev.json)
 *   BASEROW_WEB_DEV_DATABASE_NAME   (default "Website")
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getBaserowJwt } from "./lib/baserow-jwt.mjs";
import { parseDotEnv } from "../marketing/web/functions/_lib/env-pem.js";
import {
  fieldCreateBody,
  findOrCreateDatabase,
  findWorkspaceByName,
  jwtRequest,
  listAllApplications,
  listAllRows,
  orderTables,
  remapRowPayload,
  wipeTableRows,
} from "./lib/baserow-clone.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_API = "https://api.baserow.io";
const DEFAULT_SOURCE_DB = "465058";
const DEV_WORKSPACE_NAME = "Gwenda Dev";
const DEFAULT_DATABASE_NAME = "Website";
const META_PATH = resolve(ROOT, ".baserow-web-dev.json");
const OPS_META_PATH = resolve(ROOT, ".baserow-ops-dev.json");

function loadEnvFiles() {
  for (const name of [".env", ".env.web"]) {
    const path = resolve(ROOT, name);
    if (!existsSync(path)) continue;
    for (const [key, value] of parseDotEnv(readFileSync(path, "utf8"))) {
      if (!process.env[key]) process.env[key] = value;
    }
  }
}

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

function readJson(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function resolveWorkspaceIdHint() {
  const explicit = readEnv("BASEROW_WEB_DEV_WORKSPACE_ID");
  if (explicit) return explicit;
  const ops = readJson(OPS_META_PATH);
  if (ops?.workspaceId) return String(ops.workspaceId);
  return readEnv("BASEROW_OPS_DEV_WORKSPACE_ID");
}

async function resolveWorkspaceId(apiBase, jwt, workspaceName) {
  const hinted = resolveWorkspaceIdHint();
  if (hinted) {
    console.log(`Using workspace id ${hinted} (${workspaceName}).`);
    return hinted;
  }
  const found = await findWorkspaceByName(apiBase, jwt, workspaceName);
  if (!found) {
    throw new Error(
      `Workspace "${workspaceName}" not found. Clone ops first or set BASEROW_WEB_DEV_WORKSPACE_ID.`,
    );
  }
  console.log(`Using existing workspace "${found.name}" (${found.id}).`);
  return String(found.id);
}

async function resolveSourceName(apiBase, jwt, sourceDbId) {
  const apps = await listAllApplications(apiBase, jwt);
  const found = apps.find((app) => String(app.id) === String(sourceDbId));
  const name = found?.name?.trim();
  return name || DEFAULT_DATABASE_NAME;
}

function writeLocalDevHints({ workspaceId, databaseId, databaseName, sourceDbId }) {
  writeFileSync(
    META_PATH,
    `${JSON.stringify(
      {
        workspaceId,
        databaseId,
        workspaceName: DEV_WORKSPACE_NAME,
        databaseName,
        sourceDatabaseId: sourceDbId,
        clonedAt: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
  );
  console.log(`Wrote ${META_PATH}`);
}

async function main() {
  loadEnvFiles();
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log(`Usage: node scripts/clone-baserow-web-db.mjs [--dry-run] [--force]`);
    return;
  }

  const apiBase = readEnv("BASEROW_API_URL", DEFAULT_API).replace(/\/$/, "");
  const sourceDbId = readEnv("BASEROW_WEB_CLONE_SOURCE_ID", DEFAULT_SOURCE_DB);
  const workspaceName = readEnv(
    "BASEROW_WEB_DEV_WORKSPACE_NAME",
    DEV_WORKSPACE_NAME,
  );

  console.log(`Source website database: ${sourceDbId}`);
  console.log(`Target workspace name: ${workspaceName}`);
  if (opts.dryRun) console.log("Dry run (no writes).\n");

  const jwt = await getBaserowJwt(apiBase);

  const sourceTables = await jwtRequest(
    apiBase,
    jwt,
    `/api/database/tables/database/${sourceDbId}/`,
  );
  if (!Array.isArray(sourceTables) || sourceTables.length === 0) {
    throw new Error(`Source DB ${sourceDbId} has no tables (or is not visible).`);
  }

  const sourceFieldsByTableId = new Map();
  const rowCounts = new Map();
  for (const table of sourceTables) {
    const fields = await jwtRequest(
      apiBase,
      jwt,
      `/api/database/fields/table/${table.id}/`,
    );
    sourceFieldsByTableId.set(String(table.id), fields);
    const sample = await jwtRequest(
      apiBase,
      jwt,
      `/api/database/rows/table/${table.id}/?user_field_names=true&size=1`,
    );
    rowCounts.set(String(table.id), Number(sample.count || 0));
  }

  const ordered = orderTables(sourceTables, sourceFieldsByTableId);
  const sourceName = await resolveSourceName(apiBase, jwt, sourceDbId);
  const destName = readEnv("BASEROW_WEB_DEV_DATABASE_NAME", DEFAULT_DATABASE_NAME);
  const totalRows = [...rowCounts.values()].reduce((sum, n) => sum + n, 0);

  console.log(`Source database name: ${sourceName}`);
  console.log(`Destination database name: ${destName}`);
  console.log(`Would clone ${ordered.length} tables, ${totalRows} rows:`);
  for (const table of ordered) {
    const fields = sourceFieldsByTableId.get(String(table.id)) || [];
    console.log(
      `  ${table.name} (id ${table.id}, ${fields.length} fields, ${rowCounts.get(String(table.id))} rows)`,
    );
  }
  console.log(
    `\nFree workspace row cap is 3000 (shared with Ops). This clone is ${totalRows} rows.`,
  );

  if (opts.dryRun) return;

  const workspaceId = await resolveWorkspaceId(apiBase, jwt, workspaceName);
  const databaseId = await findOrCreateDatabase(apiBase, jwt, workspaceId, destName);

  let destTables = await jwtRequest(
    apiBase,
    jwt,
    `/api/database/tables/database/${databaseId}/`,
  );
  const destByName = new Map(destTables.map((t) => [t.name, t]));
  const tableIdByOldId = new Map();

  for (const source of ordered) {
    let dest = destByName.get(source.name);
    if (!dest) {
      dest = await jwtRequest(
        apiBase,
        jwt,
        `/api/database/tables/database/${databaseId}/`,
        { method: "POST", body: JSON.stringify({ name: source.name }) },
      );
      console.log(`Created table "${source.name}" (${dest.id}).`);
      destTables.push(dest);
      destByName.set(source.name, dest);
    } else {
      console.log(`Using existing table "${source.name}" (${dest.id}).`);
    }
    tableIdByOldId.set(String(source.id), String(dest.id));

    const sourceFields = sourceFieldsByTableId.get(String(source.id)) || [];
    const sourcePrimary = sourceFields.find((field) => field.primary);
    if (sourcePrimary && sourcePrimary.name !== "Name") {
      const destFields = await jwtRequest(
        apiBase,
        jwt,
        `/api/database/fields/table/${dest.id}/`,
      );
      const destPrimary = destFields.find((field) => field.primary);
      if (destPrimary && destPrimary.name !== sourcePrimary.name) {
        await jwtRequest(apiBase, jwt, `/api/database/fields/${destPrimary.id}/`, {
          method: "PATCH",
          body: JSON.stringify({ name: sourcePrimary.name }),
        });
        console.log(
          `  ~ renamed primary "${destPrimary.name}" → "${sourcePrimary.name}"`,
        );
      }
    }
  }

  for (const source of ordered) {
    const dest = destByName.get(source.name);
    const sourceFields = sourceFieldsByTableId.get(String(source.id));
    const destFields = await jwtRequest(
      apiBase,
      jwt,
      `/api/database/fields/table/${dest.id}/`,
    );
    const destByFieldName = new Map(destFields.map((f) => [f.name, f]));

    console.log(`Fields (scalars) → ${source.name}`);
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

  for (const source of ordered) {
    const dest = destByName.get(source.name);
    const sourceFields = sourceFieldsByTableId.get(String(source.id));
    const destFields = await jwtRequest(
      apiBase,
      jwt,
      `/api/database/fields/table/${dest.id}/`,
    );
    const destByFieldName = new Map(destFields.map((f) => [f.name, f]));

    console.log(`Fields (links) → ${source.name}`);
    for (const field of sourceFields) {
      if (field.type !== "link_row") continue;
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

  const idMapsByOldTableId = new Map();
  let skippedFiles = 0;

  for (const source of ordered) {
    const dest = destByName.get(source.name);
    const sourceFields = sourceFieldsByTableId.get(String(source.id));
    const rows = await listAllRows(apiBase, jwt, source.id);
    const idMap = new Map();
    idMapsByOldTableId.set(String(source.id), idMap);

    console.log(`Rows → ${source.name} (${rows.length})`);

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
          `Destination table "${source.name}" already has ${existingCount} rows. Re-run with --force to wipe and re-copy.`,
        );
      }
      console.log(`  wiping ${existingCount} existing row(s) (--force)…`);
      await wipeTableRows(apiBase, jwt, dest.id);
    }

    for (const row of rows) {
      for (const field of sourceFields) {
        if (field.type === "file" && Array.isArray(row[field.name]) && row[field.name].length) {
          skippedFiles += 1;
        }
      }
      const payload = remapRowPayload(row, sourceFields, idMapsByOldTableId);
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

  writeLocalDevHints({
    workspaceId,
    databaseId,
    databaseName: destName,
    sourceDbId,
  });

  const destSubscribe = destByName.get("Subscribers");
  const destRsvp = destByName.get("Event Invites");

  console.log(`
Clone complete.

  Workspace:  ${workspaceName}  id=${workspaceId}
  Database:   ${destName}  id=${databaseId}
  Source:     ${sourceDbId}

Next:
  1. Copy the current SM key BASEROW_API_KEY_MARKETING → BASEROW_API_KEY_MARKETING_PRODUCTION
     (keep production + Mailchimp on workspace Gwenda).
  2. In Baserow → workspace "${workspaceName}" → Settings → Database tokens:
       Create a token with access ONLY to this website database (${databaseId}).
  3. Put that token in Secrets Manager as BASEROW_API_KEY_MARKETING (local + staging).
  4. GitHub: keep secrets.BASEROW_API_KEY as the prod-workspace token;
       add secrets.BASEROW_API_KEY_STAGING with the Dev token.
  5. npm run env:web:pull
${destRsvp ? `  6. Studio grid: BASEROW_RSVP_GRID_URL=https://baserow.io/database/${databaseId}/table/${destRsvp.id}/\n` : ""}${skippedFiles ? `\n  Note: ${skippedFiles} file field value(s) were not copied.\n` : ""}`);
  if (destSubscribe) {
    console.log(`  Subscribers table id: ${destSubscribe.id}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
