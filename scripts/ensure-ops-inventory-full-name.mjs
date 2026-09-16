#!/usr/bin/env node
/**
 * Add Inventory "Full name" and fill branded bottles that the guest line
 * names generically (St-Germain → elderflower liqueur).
 *
 * Field create needs a user JWT (cached after first login). Row updates use
 * BASEROW_API_KEY.
 */
import { getBaserowJwt } from "./lib/baserow-jwt.mjs";

const apiBase = (process.env.BASEROW_API_URL || "https://api.baserow.io").replace(
  /\/$/,
  "",
);
const apiKey = process.env.BASEROW_API_KEY?.trim();
const tableId = process.env.BASEROW_OPS_INVENTORY_TABLE_ID?.trim();

const FULL_NAMES = {
  "st-germain": "St-Germain elderflower liqueur",
  italicus: "Italicus bergamot liqueur",
  borghetti: "Borghetti coffee liqueur",
  disaronno: "Disaronno amaretto",
};

if (!apiKey || !tableId) {
  console.error("Need BASEROW_API_KEY and BASEROW_OPS_INVENTORY_TABLE_ID");
  process.exit(1);
}

async function tokenRequest(path, init = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    headers: {
      Authorization: `Token ${apiKey}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const text = await response.text();
  const json = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(
      `${path} → ${response.status}: ${JSON.stringify(json).slice(0, 400)}`,
    );
  }
  return json;
}

async function jwtRequest(jwt, path, init = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    headers: {
      Authorization: `JWT ${jwt}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const text = await response.text();
  const json = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(
      `${path} → ${response.status}: ${JSON.stringify(json).slice(0, 400)}`,
    );
  }
  return json;
}

async function listFields() {
  return tokenRequest(`/api/database/fields/table/${tableId}/`);
}

async function ensureFullNameField() {
  const fields = await listFields();
  if (fields.some((field) => field.name === "Full name")) {
    console.log("Full name field already on Inventory.");
    return;
  }
  const jwt = await getBaserowJwt(apiBase, { hint: "Inventory schema" });
  await jwtRequest(jwt, `/api/database/fields/table/${tableId}/`, {
    method: "POST",
    body: JSON.stringify({ name: "Full name", type: "text" }),
  });
  console.log("Added Inventory field Full name.");
}

async function listRows() {
  const rows = [];
  let page = 1;
  for (;;) {
    const payload = await tokenRequest(
      `/api/database/rows/table/${tableId}/?user_field_names=true&size=200&page=${page}`,
    );
    rows.push(...(payload.results || []));
    if (!payload.next) break;
    page += 1;
  }
  return rows;
}

async function fillFullNames() {
  const rows = await listRows();
  let updated = 0;
  let skipped = 0;
  let missing = 0;
  for (const [key, fullName] of Object.entries(FULL_NAMES)) {
    const row = rows.find(
      (item) => String(item.Name || "").trim().toLowerCase() === key,
    );
    if (!row) {
      console.log(`  missing  ${key}`);
      missing += 1;
      continue;
    }
    const current = String(row["Full name"] || "").trim();
    if (current === fullName) {
      console.log(`  ✓ ${row.Name}`);
      skipped += 1;
      continue;
    }
    await tokenRequest(
      `/api/database/rows/table/${tableId}/${row.id}/?user_field_names=true`,
      { method: "PATCH", body: JSON.stringify({ "Full name": fullName }) },
    );
    console.log(`  ~ ${row.Name} → ${fullName}`);
    updated += 1;
  }
  console.log(
    `Full names: ${updated} updated, ${skipped} already set, ${missing} missing.`,
  );
}

async function main() {
  await ensureFullNameField();
  await fillFullNames();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
