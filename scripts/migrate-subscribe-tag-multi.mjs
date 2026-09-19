#!/usr/bin/env node
/**
 * Convert subscribe `Tag` from single_select → multiple_select and ensure
 * the `wifi` (and `prelaunch`) options exist.
 *
 * Captive portal merges tags when a guest email already exists (e.g. prelaunch
 * + wifi). Mailchimp sync applies every Tag value.
 *
 * Database tokens only allow row CRUD. Field edits need a JWT from
 * POST /api/user/token-auth/ (Admin or Builder on the workspace).
 *
 * Env: cached JWT in `.baserow-jwt.json`, or BASEROW_JWT_EMAIL /
 * BASEROW_JWT_PASSWORD (or interactive TTY prompt)
 */
import { getBaserowJwt } from "./lib/baserow-jwt.mjs";

const API_BASE = (process.env.BASEROW_API_URL || "https://api.baserow.io").replace(
  /\/$/,
  "",
);
const WIFI_OPTION = process.env.WIFI_SUBSCRIBE_TAG?.trim() || "wifi";
const REQUIRED_OPTIONS = ["prelaunch", WIFI_OPTION];
const TABLE_IDS = (process.env.SUBSCRIBE_TABLE_IDS || "1017358,1208349")
  .split(",")
  .map((id) => id.trim())
  .filter(Boolean);

const OPTION_COLORS = {
  prelaunch: "light-blue",
  wifi: "dark-blue",
};

async function baserowRequest(jwt, path, init = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `JWT ${jwt}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await response.text();
  let json = null;
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

function buildSelectOptions(existing) {
  const byValue = new Map();
  for (const option of existing ?? []) {
    if (option?.value) byValue.set(option.value, option);
  }
  for (const value of REQUIRED_OPTIONS) {
    if (!byValue.has(value)) {
      byValue.set(value, {
        value,
        color: OPTION_COLORS[value] || "dark-gray",
      });
    }
  }
  return [...byValue.values()].map((option) =>
    option.id
      ? { id: option.id, value: option.value, color: option.color }
      : { value: option.value, color: option.color },
  );
}

async function ensureMultiTag(jwt, tableId) {
  const fields = await baserowRequest(
    jwt,
    `/api/database/fields/table/${tableId}/`,
  );
  const tag = fields.find((field) => field.name === "Tag");
  if (!tag) {
    console.log(`- table ${tableId}: no Tag field, skipped`);
    return;
  }

  if (tag.type !== "single_select" && tag.type !== "multiple_select") {
    console.log(`- table ${tableId}: Tag is ${tag.type}, skipped`);
    return;
  }

  const selectOptions = buildSelectOptions(tag.select_options);
  const payload = {
    type: "multiple_select",
    select_options: selectOptions,
  };

  if (tag.type === "multiple_select") {
    const values = new Set((tag.select_options ?? []).map((o) => o.value));
    const missing = REQUIRED_OPTIONS.filter((v) => !values.has(v));
    if (!missing.length) {
      console.log(`- table ${tableId}: already multiple_select with options`);
      return;
    }
  }

  await baserowRequest(jwt, `/api/database/fields/${tag.id}/`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });

  const from = tag.type;
  console.log(
    `- table ${tableId}: ${from} → multiple_select (${selectOptions.map((o) => o.value).join(", ")})`,
  );
}

async function main() {
  const jwt = await getBaserowJwt(API_BASE);
  for (const tableId of TABLE_IDS) {
    await ensureMultiTag(jwt, tableId);
  }
  console.log(
    "\nDone. Tag is multiple_select; portal can merge wifi onto existing tags.",
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
