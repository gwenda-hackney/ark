#!/usr/bin/env node
/**
 * Create (or repair) the Form Submissions Baserow table for local dev + staging.
 *
 * Database tokens only allow row CRUD. Creating tables/fields requires a short-lived
 * JWT from POST /api/user/token-auth/ (Admin or Builder on the workspace).
 *
 * Dev and gwenda-staging share Gwenda Dev / Website. Production tables
 * are created separately when you promote.
 *
 * Usage:
 *   npm run setup:baserow-form-submissions
 *
 * Prompts for Baserow email + password on first login, then caches the JWT in
 * `.baserow-jwt.json`. Optional non-interactive:
 *   BASEROW_JWT_EMAIL, BASEROW_JWT_PASSWORD
 *
 * Optional:
 *   BASEROW_FORM_SUBMISSIONS_TABLE_NAME=Form Submissions
 *   BASEROW_API_URL=https://api.baserow.io
 */
import { getBaserowJwt } from "./lib/baserow-jwt.mjs";
import { resolveWebsiteDatabase } from "./lib/baserow-clone.mjs";
import {
  DEFAULT_BASEROW_API,
  FORM_SUBMISSIONS_TABLE_NAME,
  SUBSCRIBE_TABLE_NAME,
  WEBSITE_DATABASE_NAME,
} from "../marketing/web/functions/_lib/baserow.js";

const EXPECTED_FIELDS = [
  {
    name: "Submitted",
    body: {
      name: "Submitted",
      type: "date",
      date_include_time: true,
      date_format: "ISO",
    },
  },
  {
    name: "Form Title",
    body: { name: "Form Title", type: "text" },
  },
  {
    name: "Reply To",
    body: { name: "Reply To", type: "text" },
  },
  {
    name: "Status",
    body: {
      name: "Status",
      type: "single_select",
      select_options: [
        { value: "Pending", color: "light-orange" },
        { value: "Verified", color: "green" },
      ],
    },
  },
  {
    name: "Current",
    body: { name: "Current", type: "boolean" },
  },
  {
    name: "Answers",
    body: { name: "Answers", type: "long_text" },
  },
  // Stamped by the site (and ops resend) after each email actually goes out.
  ...["Notify Sent", "Receipt Sent"].map((name) => ({
    name,
    body: {
      name,
      type: "date",
      date_include_time: true,
      date_format: "ISO",
      date_time_format: "24",
    },
  })),
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

async function loadDatabaseTables(apiBase, jwt, databaseId, label) {
  const tables = await baserowRequest(
    apiBase,
    jwt,
    `/api/database/tables/database/${databaseId}/`,
  );
  const marker = tables.find((table) => table.name === SUBSCRIBE_TABLE_NAME);
  if (!marker) {
    throw new Error(
      `Expected ${label} "${WEBSITE_DATABASE_NAME}" (${databaseId}) to contain "${SUBSCRIBE_TABLE_NAME}".`,
    );
  }
  console.log(
    `${label} "${WEBSITE_DATABASE_NAME}" (${databaseId}), "${marker.name}" id ${marker.id}.`,
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

async function ensurePrimaryNamedFormSlug(apiBase, jwt, tableId) {
  const fields = await baserowRequest(
    apiBase,
    jwt,
    `/api/database/fields/table/${tableId}/`,
  );
  const primary = fields.find((field) => field.primary);
  if (!primary) {
    throw new Error(`No primary field on table ${tableId}.`);
  }

  const patch = {};
  if (primary.name !== "Form Slug") {
    patch.name = "Form Slug";
  }
  if (primary.db_index !== true) {
    patch.db_index = true;
  }

  if (Object.keys(patch).length === 0) {
    console.log(`  ✓ Form Slug (primary, indexed)`);
    return fields;
  }

  await baserowRequest(apiBase, jwt, `/api/database/fields/${primary.id}/`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
  if (patch.name) {
    console.log(`  ~ renamed primary "${primary.name}" → "Form Slug"`);
  }
  if (patch.db_index) {
    console.log(`  ~ indexed Form Slug`);
  }
  return baserowRequest(apiBase, jwt, `/api/database/fields/table/${tableId}/`);
}

async function ensureFields(apiBase, jwt, tableId) {
  let fields = await ensurePrimaryNamedFormSlug(apiBase, jwt, tableId);
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
  const production = process.argv.includes("--production");
  const tableName =
    readEnv("BASEROW_FORM_SUBMISSIONS_TABLE_NAME") || FORM_SUBMISSIONS_TABLE_NAME;
  const apiBase = (readEnv("BASEROW_API_URL") || DEFAULT_BASEROW_API).replace(/\/$/, "");
  const label = production ? "Production" : "Dev";

  const jwt = await getBaserowJwt(apiBase, {
    hint: `${label} ${WEBSITE_DATABASE_NAME}`,
  });

  let databaseId = readEnv("BASEROW_DATABASE_ID");
  if (!databaseId) {
    const found = await resolveWebsiteDatabase(apiBase, jwt, { production });
    databaseId = found.databaseId;
    console.log(
      `${found.workspaceName} / ${found.databaseName} (${databaseId}).`,
    );
  }

  console.log(`Table "${tableName}"…`);
  const tables = await loadDatabaseTables(
    apiBase,
    jwt,
    databaseId,
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
  console.log(`Form Submissions table ready (id ${table.id}).`);
  console.log(`Grid: ${gridUrl}`);
  console.log("");
  if (production) {
    console.log("Production table created. The site resolves this table by name at runtime.");
  } else {
    console.log("Next:");
    console.log("  1. Ensure BASEROW_API_KEY in .env can create rows on this table.");
    console.log("  2. Runtime code resolves the table by name — no table id in .env.");
    console.log("");
    console.log("Production: npm run setup:baserow-form-submissions -- --production");
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
