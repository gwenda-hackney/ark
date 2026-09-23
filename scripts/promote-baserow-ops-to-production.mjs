#!/usr/bin/env node
/**
 * Copy Gwenda Dev Ops Baserow → production Ops DB (556507).
 *
 * Wipes destination tables and re-copies rows from the local/dev clone so
 * production matches the data you edited locally (not seed scripts).
 *
 *   npm run promote:baserow-ops-to-production -- --dry-run
 *   npm run promote:baserow-ops-to-production -- --confirm production
 *
 * Requires JWT (Admin/Builder). Source rows: BASEROW_API_KEY (dev token).
 * Photo/file field *values* are skipped (columns kept); re-upload if needed.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getBaserowJwt } from "./lib/baserow-jwt.mjs";
import { parseDotEnv } from "../marketing/web/functions/_lib/env-pem.js";
import {
  OPS_PRODUCTION_DATABASE_ID,
  TABLE_CONFIG,
  TABLE_EVENT_DATES,
  TABLE_EVENTS,
  TABLE_INGREDIENTS,
  TABLE_INVENTORY,
  TABLE_INVENTORY_SUPPLIERS,
  TABLE_ITEMS,
  TABLE_MENU_PLACEMENTS,
  TABLE_POS_MENUS,
  TABLE_SECTIONS,
  TABLE_SUPPLIERS,
  TABLE_USERS,
} from "../ops/site/functions/_lib/baserow.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_API = "https://api.baserow.io";
const DEV_META_PATH = resolve(ROOT, ".baserow-ops-dev.json");

/** Parents before children that link to them. */
const TABLE_ORDER = [
  TABLE_SUPPLIERS,
  TABLE_INVENTORY,
  TABLE_INVENTORY_SUPPLIERS,
  TABLE_SECTIONS,
  TABLE_ITEMS,
  TABLE_INGREDIENTS,
  TABLE_USERS,
  TABLE_CONFIG,
  TABLE_POS_MENUS,
  TABLE_MENU_PLACEMENTS,
  TABLE_EVENTS,
  TABLE_EVENT_DATES,
];

const SKIP_LINK_CREATE = new Set([
  `${TABLE_INVENTORY}|Inventory suppliers`,
  `${TABLE_SUPPLIERS}|Inventory suppliers`,
  `${TABLE_EVENTS}|Event dates`,
]);

function loadEnvFiles() {
  for (const name of [".env", ".env.ops", ".env.ark"]) {
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
  const out = { dryRun: false, confirm: "", help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--dry-run") out.dryRun = true;
    else if (arg === "--help" || arg === "-h") out.help = true;
    else if (arg === "--confirm") {
      out.confirm = String(argv[i + 1] || "").trim();
      i += 1;
    } else if (arg.startsWith("--confirm=")) {
      out.confirm = arg.slice("--confirm=".length).trim();
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  return out;
}

function sourceDatabaseId() {
  if (existsSync(DEV_META_PATH)) {
    const meta = JSON.parse(readFileSync(DEV_META_PATH, "utf8"));
    if (meta.databaseId) return String(meta.databaseId);
  }
  return readEnv("BASEROW_OPS_DATABASE_ID");
}

async function jwtRequest(apiBase, jwtRef, path, init = {}) {
  const url = path.startsWith("http") ? path : `${apiBase}${path}`;
  const run = async (jwt) => {
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
    return { response, text, json };
  };

  let jwt = typeof jwtRef === "object" ? jwtRef.token : jwtRef;
  let { response, text, json } = await run(jwt);
  if (response.status === 401 && typeof jwtRef === "object") {
    jwtRef.token = await getBaserowJwt(apiBase, { forceRefresh: true });
    jwt = jwtRef.token;
    ({ response, text, json } = await run(jwt));
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

async function listAllRowsJwt(apiBase, jwt, tableId) {
  const rows = [];
  let page = 1;
  for (;;) {
    const payload = await jwtRequest(
      apiBase,
      jwt,
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
  if (field.type === "boolean") return { ...base };
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
    field.type === "date"
  ) {
    return base;
  }
  if (
    field.type === "formula" ||
    field.type === "lookup" ||
    field.type === "rollup" ||
    field.type === "count" ||
    field.type === "created_on" ||
    field.type === "last_modified"
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

async function wipeTable(apiBase, jwt, tableId) {
  for (;;) {
    const batch = await jwtRequest(
      apiBase,
      jwt,
      `/api/database/rows/table/${tableId}/?user_field_names=true&size=200&page=1`,
    );
    const ids = (batch.results || []).map((row) => row.id);
    if (!ids.length) break;
    await jwtRequest(
      apiBase,
      jwt,
      `/api/database/rows/table/${tableId}/batch-delete/`,
      { method: "POST", body: JSON.stringify({ items: ids }) },
    );
    if (!batch.next && ids.length < 200) break;
  }
}

/** Ensure destination select fields include every source option value. */
async function syncSelectOptions(apiBase, jwt, sourceFields, destFields) {
  const destByName = new Map(destFields.map((f) => [f.name, f]));
  for (const source of sourceFields) {
    if (
      source.type !== "single_select" &&
      source.type !== "multiple_select"
    ) {
      continue;
    }
    const dest = destByName.get(source.name);
    if (!dest) continue;
    const destValues = new Set(
      (dest.select_options || []).map((opt) => opt.value),
    );
    const missing = (source.select_options || []).filter(
      (opt) => !destValues.has(opt.value),
    );
    if (!missing.length) continue;
    const select_options = [
      ...(dest.select_options || []).map((opt) => ({
        id: opt.id,
        value: opt.value,
        color: opt.color || "light-gray",
      })),
      ...missing.map((opt) => ({
        value: opt.value,
        color: opt.color || "light-gray",
      })),
    ];
    await jwtRequest(apiBase, jwt, `/api/database/fields/${dest.id}/`, {
      method: "PATCH",
      body: JSON.stringify({ select_options }),
    });
    console.log(
      `  ~ ${source.name}: added ${missing.map((o) => o.value).join(", ")}`,
    );
  }
}

async function main() {
  loadEnvFiles();
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log(`Usage:
  npm run promote:baserow-ops-to-production -- --dry-run
  npm run promote:baserow-ops-to-production -- --confirm production
`);
    return;
  }

  const apiBase = readEnv("BASEROW_API_URL", DEFAULT_API).replace(/\/$/, "");
  const sourceDbId = sourceDatabaseId();
  const destDbId = OPS_PRODUCTION_DATABASE_ID;
  const apiKey = readEnv("BASEROW_API_KEY");
  if (!sourceDbId) {
    throw new Error(
      "Dev Ops DB id missing. Need .baserow-ops-dev.json or BASEROW_OPS_DATABASE_ID.",
    );
  }
  if (!apiKey) throw new Error("BASEROW_API_KEY is required to read the dev database.");
  if (String(sourceDbId) === String(destDbId)) {
    throw new Error("Source and destination Ops databases are the same id.");
  }

  console.log(`Source (dev):  ${sourceDbId}`);
  console.log(`Dest (prod):   ${destDbId}`);
  if (opts.dryRun) console.log("Dry run (no writes).\n");

  if (!opts.dryRun && opts.confirm !== "production") {
    throw new Error(
      'Refusing to wipe production Ops without --confirm production',
    );
  }

  const jwtRef = { token: await getBaserowJwt(apiBase) };

  const sourceTables = await jwtRequest(
    apiBase,
    jwtRef,
    `/api/database/tables/database/${sourceDbId}/`,
  );
  const destTables = await jwtRequest(
    apiBase,
    jwtRef,
    `/api/database/tables/database/${destDbId}/`,
  );
  const sourceByName = new Map(sourceTables.map((t) => [t.name, t]));
  const destByName = new Map(destTables.map((t) => [t.name, t]));

  const present = TABLE_ORDER.filter((name) => sourceByName.has(name));
  const missingOnSource = TABLE_ORDER.filter((name) => !sourceByName.has(name));
  if (missingOnSource.length) {
    console.log(`Skipping (not on source): ${missingOnSource.join(", ")}`);
  }
  if (!present.length) throw new Error("No Ops tables found on source.");

  if (opts.dryRun) {
    console.log("Would promote:");
    for (const name of present) {
      const source = sourceByName.get(name);
      const rows = await listAllRowsJwt(apiBase, jwtRef, source.id);
      const dest = destByName.get(name);
      console.log(
        `  ${name}: ${rows.length} rows → prod ${dest ? `table ${dest.id}` : "(create table)"}`,
      );
    }
    return;
  }

  const sourceFieldsByTable = new Map();
  for (const name of present) {
    const table = sourceByName.get(name);
    const fields = await jwtRequest(
      apiBase,
      jwtRef,
      `/api/database/fields/table/${table.id}/`,
    );
    sourceFieldsByTable.set(name, fields);
  }

  const tableIdByOldId = new Map();
  for (const name of present) {
    const source = sourceByName.get(name);
    let dest = destByName.get(name);
    if (!dest) {
      dest = await jwtRequest(
        apiBase,
        jwtRef,
        `/api/database/tables/database/${destDbId}/`,
        { method: "POST", body: JSON.stringify({ name }) },
      );
      console.log(`Created prod table "${name}" (${dest.id}).`);
      destByName.set(name, dest);
    } else {
      console.log(`Using prod table "${name}" (${dest.id}).`);
    }
    tableIdByOldId.set(String(source.id), String(dest.id));
  }

  for (const name of present) {
    const dest = destByName.get(name);
    const sourceFields = sourceFieldsByTable.get(name);
    let destFields = await jwtRequest(
      apiBase,
      jwtRef,
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
      await jwtRequest(apiBase, jwtRef, `/api/database/fields/table/${dest.id}/`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      console.log(`  + ${field.name}`);
    }
    destFields = await jwtRequest(
      apiBase,
      jwtRef,
      `/api/database/fields/table/${dest.id}/`,
    );
    await syncSelectOptions(apiBase, jwtRef, sourceFields, destFields);
  }

  for (const name of present) {
    const dest = destByName.get(name);
    const sourceFields = sourceFieldsByTable.get(name);
    const destFields = await jwtRequest(
      apiBase,
      jwtRef,
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
      await jwtRequest(apiBase, jwtRef, `/api/database/fields/table/${dest.id}/`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      console.log(`  + ${field.name}`);
    }
  }

  const idMapsByOldTableId = new Map();
  let skippedPhotos = 0;

  for (const name of present) {
    const source = sourceByName.get(name);
    const dest = destByName.get(name);
    const sourceFields = sourceFieldsByTable.get(name);
    const rows = await listAllRows(apiBase, apiKey, source.id);
    const idMap = new Map();
    idMapsByOldTableId.set(String(source.id), idMap);

    console.log(`Rows → ${name} (${rows.length})`);
    console.log(`  wiping production…`);
    await wipeTable(apiBase, jwtRef, dest.id);

    for (const row of rows) {
      if (Array.isArray(row.Photo) && row.Photo.length) skippedPhotos += 1;
      const payload = remapRowPayload(row, sourceFields, idMapsByOldTableId);
      if (!payload.Name && row.Name) payload.Name = row.Name;
      const created = await jwtRequest(
        apiBase,
        jwtRef,
        `/api/database/rows/table/${dest.id}/?user_field_names=true`,
        { method: "POST", body: JSON.stringify(payload) },
      );
      idMap.set(String(row.id), String(created.id));
    }
    console.log(`  copied ${rows.length}`);
  }

  console.log(`
Promote complete.

  Source (dev):  ${sourceDbId}
  Dest (prod):   ${destDbId}
${skippedPhotos ? `\n  Note: ${skippedPhotos} Photo file value(s) were not copied. Re-upload or run fetch:ops-menu-photos against production if needed.\n` : ""}
Next: deploy the ops app (npm run deploy -w @gwenda/ops).
`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
