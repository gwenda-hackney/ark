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
 * Also creates the Users table (Email + Active). Runtime settings live in the
 * separate config database (npm run setup:baserow-config). Optional one-time Users seed
 * from OPS_ALLOWED_EMAILS if that leftover is still in .env. After that, add
 * people in Baserow, not env.
 *
 * Prompts for Baserow email + password on first login, then caches the JWT in
 * `.baserow-jwt.json` (gitignored) for this checkout. Optional non-interactive:
 *   BASEROW_JWT_EMAIL, BASEROW_JWT_PASSWORD
 *   BASEROW_WORKSPACE_ID   (required to create a new database)
 *   BASEROW_OPS_DATABASE_ID (reuse an existing Ops database)
 */
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
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
  TABLE_POS_MENUS,
  TABLE_MENU_PLACEMENTS,
  TABLE_EVENTS,
  TABLE_EVENT_DATES,
  TABLE_ARTISTS,
} from "../ops/site/functions/_lib/baserow.js";
import {
  DEFAULT_POS_MENU_NAME,
  LEGACY_DEFAULT_POS_MENU_NAME,
} from "../ops/site/functions/_lib/pos-menu-store.js";
import { parseEmailList } from "./lib/parse-email-list.mjs";
import {
  looksLikeOnlyUrls,
  parseProductUrl,
  SEED_SUPPLIERS,
  skuFromProductUrl,
  supplierFromUrl,
} from "../ops/site/functions/_lib/suppliers.js";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const LWC_PRICES = JSON.parse(
  readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "data/lwc-price-list.json"),
    "utf8",
  ),
);

const DEFAULT_BASEROW_API = "https://api.baserow.io";

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
    console.log(
      `Using only workspace: ${workspaces[0].name} (${workspaces[0].id})`,
    );
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
    console.log(
      `Using existing database "${OPS_DATABASE_NAME}" (id ${existing.id}).`,
    );
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
  const created = [];
  for (const expected of expectedFields) {
    const existing = byName.get(expected.name);
    if (existing) {
      const body =
        typeof expected.body === "function"
          ? expected.body(byName)
          : expected.body;
      const wanted = body?.select_options;
      if (
        Array.isArray(wanted) &&
        wanted.length > 0 &&
        Array.isArray(existing.select_options)
      ) {
        const have = new Set(
          existing.select_options.map((opt) => String(opt.value)),
        );
        const missing = wanted.filter((opt) => !have.has(String(opt.value)));
        if (missing.length > 0) {
          await baserowRequest(
            apiBase,
            jwt,
            `/api/database/fields/${existing.id}/`,
            {
              method: "PATCH",
              body: JSON.stringify({
                select_options: [
                  ...existing.select_options.map((opt) => ({
                    id: opt.id,
                    value: opt.value,
                    color: opt.color,
                  })),
                  ...missing.map((opt) => ({
                    value: opt.value,
                    color: opt.color,
                  })),
                ],
              }),
            },
          );
          console.log(
            `  ~ ${expected.name} (+${missing.map((o) => o.value).join(", ")})`,
          );
          continue;
        }
      }
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
    await baserowRequest(
      apiBase,
      jwt,
      `/api/database/fields/table/${tableId}/`,
      {
        method: "POST",
        body: JSON.stringify(body),
      },
    );
    console.log(`  + ${expected.name}`);
    created.push(expected.name);
  }
  return created;
}

async function defaultBooleanField(apiBase, jwt, tableId, fieldName, value) {
  const rows = await listRows(apiBase, jwt, tableId);
  let patched = 0;
  for (const row of rows) {
    if (Boolean(row[fieldName]) === Boolean(value)) continue;
    await baserowRequest(
      apiBase,
      jwt,
      `/api/database/rows/table/${tableId}/${row.id}/?user_field_names=true`,
      { method: "PATCH", body: JSON.stringify({ [fieldName]: value }) },
    );
    patched += 1;
  }
  console.log(`  → ${fieldName}=${value} on ${patched} existing row(s)`);
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

function itemFields(sectionsTableId, posMenusTableId) {
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
    {
      name: "Lock menu line",
      body: { name: "Lock menu line", type: "boolean" },
    },
    { name: "Price", body: { name: "Price", type: "text" } },
    { name: "Alt price", body: { name: "Alt price", type: "text" } },
    {
      name: "Drink type",
      body: {
        name: "Drink type",
        type: "single_select",
        select_options: [
          { value: "cocktail", color: "purple" },
          { value: "pour", color: "orange" },
          { value: "beer", color: "yellow" },
          { value: "packaged", color: "cyan" },
          { value: "postmix", color: "light-blue" },
        ],
      },
    },
    {
      name: "Cocktail type",
      body: {
        name: "Cocktail type",
        type: "single_select",
        select_options: [
          { value: "spritz", color: "pink" },
          { value: "highball", color: "blue" },
          { value: "sour", color: "yellow" },
          { value: "stirred", color: "dark-gray" },
          { value: "negroni", color: "orange" },
          { value: "fizz", color: "cyan" },
          { value: "other", color: "light-gray" },
        ],
      },
    },
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
    {
      name: "On print menu",
      body: { name: "On print menu", type: "boolean" },
    },
    {
      name: "Publish snapshots",
      body: { name: "Publish snapshots", type: "long_text" },
    },
    {
      name: "AI reading",
      body: { name: "AI reading", type: "long_text" },
    },
    { name: "Lightspeed SKU", body: { name: "Lightspeed SKU", type: "text" } },
    {
      name: "Lightspeed SKU alt",
      body: { name: "Lightspeed SKU alt", type: "text" },
    },
    {
      name: "Lightspeed name",
      body: { name: "Lightspeed name", type: "text" },
    },
    {
      name: "Lightspeed menu/screen",
      body: { name: "Lightspeed menu/screen", type: "text" },
    },
    {
      name: "Lightspeed status",
      body: {
        name: "Lightspeed status",
        type: "single_select",
        select_options: [
          { value: "matched", color: "green" },
          { value: "mismatch", color: "orange" },
          { value: "missing", color: "red" },
        ],
      },
    },
    {
      name: "POS menus",
      body: posMenusTableId
        ? {
            name: "POS menus",
            type: "link_row",
            link_row_table_id: posMenusTableId,
            has_related_field: false,
          }
        : null,
    },
  ];
}

function posMenuFields() {
  return [
    {
      name: "Order",
      body: {
        name: "Order",
        type: "number",
        number_decimal_places: 0,
        number_negative: false,
      },
    },
    { name: "Default", body: { name: "Default", type: "boolean" } },
  ];
}

function menuPlacementFields(itemsTableId, sectionsTableId, posMenusTableId) {
  return [
    {
      name: "Menu item",
      body: {
        name: "Menu item",
        type: "link_row",
        link_row_table_id: itemsTableId,
        has_related_field: false,
      },
    },
    {
      name: "Channel",
      body: {
        name: "Channel",
        type: "single_select",
        select_options: [
          { value: "print", color: "orange" },
          { value: "digital", color: "blue" },
          { value: "pos", color: "green" },
        ],
      },
    },
    {
      name: "Section",
      body: {
        name: "Section",
        type: "link_row",
        link_row_table_id: sectionsTableId,
        has_related_field: false,
      },
    },
    {
      name: "POS menu",
      body: {
        name: "POS menu",
        type: "link_row",
        link_row_table_id: posMenusTableId,
        has_related_field: false,
      },
    },
    { name: "POS screen", body: { name: "POS screen", type: "text" } },
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

function linkIdsFrom(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (typeof entry === "number") return entry;
      if (entry && typeof entry === "object" && entry.id != null)
        return Number(entry.id);
      return null;
    })
    .filter((id) => Number.isFinite(id));
}

async function seedFallMenu(
  apiBase,
  jwt,
  posMenusTableId,
  itemsTableId,
  { linkEmptyItems },
) {
  let rows = await listRows(apiBase, jwt, posMenusTableId);
  for (const row of rows) {
    if (String(row.Name || "").trim()) continue;
    await baserowRequest(
      apiBase,
      jwt,
      `/api/database/rows/table/${posMenusTableId}/${row.id}/`,
      { method: "DELETE" },
    );
    console.log(`  - empty sample row ${row.id}`);
  }
  rows = rows.filter((row) => String(row.Name || "").trim());
  const key = DEFAULT_POS_MENU_NAME.toLowerCase();
  const legacyKey = LEGACY_DEFAULT_POS_MENU_NAME.toLowerCase();
  let fall = rows.find(
    (row) =>
      String(row.Name || "")
        .trim()
        .toLowerCase() === key,
  );
  if (!fall) {
    const legacy = rows.find(
      (row) =>
        String(row.Name || "")
          .trim()
          .toLowerCase() === legacyKey,
    );
    if (legacy) {
      fall = await baserowRequest(
        apiBase,
        jwt,
        `/api/database/rows/table/${posMenusTableId}/${legacy.id}/?user_field_names=true`,
        {
          method: "PATCH",
          body: JSON.stringify({ Name: DEFAULT_POS_MENU_NAME }),
        },
      );
      console.log(
        `  → renamed ${LEGACY_DEFAULT_POS_MENU_NAME} → ${DEFAULT_POS_MENU_NAME}`,
      );
    }
  }
  const created = !fall;
  if (!fall) {
    fall = await baserowRequest(
      apiBase,
      jwt,
      `/api/database/rows/table/${posMenusTableId}/?user_field_names=true`,
      {
        method: "POST",
        body: JSON.stringify({
          Name: DEFAULT_POS_MENU_NAME,
          Order: 1,
          Default: true,
        }),
      },
    );
    console.log(`  + ${DEFAULT_POS_MENU_NAME}`);
  } else if (!rows.some((row) => Boolean(row.Default))) {
    await baserowRequest(
      apiBase,
      jwt,
      `/api/database/rows/table/${posMenusTableId}/${fall.id}/?user_field_names=true`,
      { method: "PATCH", body: JSON.stringify({ Default: true }) },
    );
    console.log(`  → Default on ${DEFAULT_POS_MENU_NAME}`);
  } else {
    console.log(`  ✓ ${DEFAULT_POS_MENU_NAME}`);
  }
  const items = await listRows(apiBase, jwt, itemsTableId);
  if (!linkEmptyItems && !created) {
    const anyLinked = items.some(
      (item) => linkIdsFrom(item["POS menus"]).length,
    );
    if (anyLinked) {
      console.log(`  · skip item links (POS menus already assigned)`);
      return;
    }
  }
  let patched = 0;
  for (const item of items) {
    const linked = linkIdsFrom(item["POS menus"]);
    if (linked.length) continue;
    await baserowRequest(
      apiBase,
      jwt,
      `/api/database/rows/table/${itemsTableId}/${item.id}/?user_field_names=true`,
      { method: "PATCH", body: JSON.stringify({ "POS menus": [fall.id] }) },
    );
    patched += 1;
  }
  console.log(`  → ${DEFAULT_POS_MENU_NAME} on ${patched} menu item(s)`);
}

function ingredientFields(itemsTableId, inventoryTableId) {
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
      name: "Inventory",
      body: inventoryTableId
        ? {
            name: "Inventory",
            type: "link_row",
            link_row_table_id: inventoryTableId,
            has_related_field: false,
          }
        : null,
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
    { name: "ABV", body: { name: "ABV", type: "text" } },
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

function inventoryFields() {
  return [
    { name: "Full name", body: { name: "Full name", type: "text" } },
    {
      name: "Kind",
      body: {
        name: "Kind",
        type: "single_select",
        select_options: [
          { value: "liquor", color: "purple" },
          { value: "liqueur", color: "dark-purple" },
          { value: "wine", color: "red" },
          { value: "beer", color: "yellow" },
          { value: "syrup", color: "orange" },
          { value: "juice", color: "green" },
          { value: "bitter", color: "brown" },
          { value: "mixer", color: "cyan" },
          { value: "garnish", color: "light-green" },
          { value: "other", color: "gray" },
        ],
      },
    },
    { name: "ABV", body: { name: "ABV", type: "text" } },
    {
      name: "Default unit",
      body: {
        name: "Default unit",
        type: "single_select",
        select_options: RECIPE_UNITS.map((value, index) => ({
          value,
          color: ["blue", "green", "orange", "purple", "cyan"][index % 5],
        })),
      },
    },
    {
      name: "Estimated cost",
      body: {
        name: "Estimated cost",
        type: "number",
        number_decimal_places: 2,
        number_negative: false,
      },
    },
    { name: "Notes", body: { name: "Notes", type: "text" } },
    { name: "Active", body: { name: "Active", type: "boolean" } },
    { name: "Lightspeed SKU", body: { name: "Lightspeed SKU", type: "text" } },
    {
      name: "Actual qty",
      body: {
        name: "Actual qty",
        type: "number",
        number_decimal_places: 3,
        number_negative: false,
      },
    },
    { name: "Actual unit", body: { name: "Actual unit", type: "text" } },
    {
      name: "Counted at",
      body: {
        name: "Counted at",
        type: "date",
        date_format: "ISO",
        date_include_time: true,
        date_time_format: "24",
      },
    },
  ];
}

function eventFields() {
  return [
    { name: "Artist", body: { name: "Artist", type: "text" } },
    { name: "Offer", body: { name: "Offer", type: "text" } },
    { name: "Page link", body: { name: "Page link", type: "url" } },
    {
      name: "Short description",
      body: { name: "Short description", type: "long_text" },
    },
    { name: "Description", body: { name: "Description", type: "long_text" } },
    {
      name: "Operations notes",
      body: { name: "Operations notes", type: "long_text" },
    },
    { name: "Image links", body: { name: "Image links", type: "long_text" } },
    {
      name: "Starts on",
      body: {
        name: "Starts on",
        type: "date",
        date_format: "ISO",
        date_include_time: false,
      },
    },
    { name: "Time", body: { name: "Time", type: "text" } },
    { name: "Start time", body: { name: "Start time", type: "text" } },
    { name: "End time", body: { name: "End time", type: "text" } },
    {
      name: "Night schedule",
      body: { name: "Night schedule", type: "long_text" },
    },
    {
      name: "Repeat every",
      body: {
        name: "Repeat every",
        type: "number",
        number_decimal_places: 0,
        number_negative: false,
      },
    },
    {
      name: "Repeat unit",
      body: {
        name: "Repeat unit",
        type: "single_select",
        select_options: [
          { value: "none", color: "gray" },
          { value: "once", color: "yellow" },
          { value: "day", color: "blue" },
          { value: "week", color: "green" },
          { value: "month", color: "purple" },
        ],
      },
    },
    { name: "Weekdays", body: { name: "Weekdays", type: "text" } },
    {
      name: "Month day",
      body: {
        name: "Month day",
        type: "number",
        number_decimal_places: 0,
        number_negative: false,
      },
    },
    {
      name: "Ends on",
      body: {
        name: "Ends on",
        type: "date",
        date_format: "ISO",
        date_include_time: false,
      },
    },
    {
      name: "Skipped dates",
      body: { name: "Skipped dates", type: "long_text" },
    },
    {
      name: "Extra dates",
      body: { name: "Extra dates", type: "long_text" },
    },
    { name: "Slug", body: { name: "Slug", type: "text" } },
    { name: "Drive folder id", body: { name: "Drive folder id", type: "text" } },
    {
      name: "Replaces series",
      body: { name: "Replaces series", type: "text" },
    },
    { name: "Main image", body: { name: "Main image", type: "file" } },
    {
      name: "Hero crops",
      body: { name: "Hero crops", type: "long_text" },
    },
    { name: "Images", body: { name: "Images", type: "file" } },
  ];
}

function eventDateFields(eventsTableId) {
  return [
    {
      name: "Event",
      body: {
        name: "Event",
        type: "link_row",
        link_row_table_id: eventsTableId,
      },
    },
    {
      name: "Date",
      body: {
        name: "Date",
        type: "date",
        date_format: "ISO",
        date_include_time: false,
      },
    },
    { name: "Slug", body: { name: "Slug", type: "text" } },
    { name: "Sanity ID", body: { name: "Sanity ID", type: "text" } },
    {
      name: "ClickUp Task ID",
      body: { name: "ClickUp Task ID", type: "text" },
    },
    {
      name: "Title override",
      body: { name: "Title override", type: "text" },
    },
    {
      name: "Artist override",
      body: { name: "Artist override", type: "text" },
    },
    { name: "Offer override", body: { name: "Offer override", type: "text" } },
    {
      name: "Description override",
      body: { name: "Description override", type: "long_text" },
    },
    {
      name: "Short description override",
      body: { name: "Short description override", type: "long_text" },
    },
    { name: "Time override", body: { name: "Time override", type: "text" } },
    {
      name: "Start time override",
      body: { name: "Start time override", type: "text" },
    },
    {
      name: "End time override",
      body: { name: "End time override", type: "text" },
    },
    {
      name: "Night schedule override",
      body: { name: "Night schedule override", type: "long_text" },
    },
    {
      name: "Operations notes override",
      body: { name: "Operations notes override", type: "long_text" },
    },
    {
      name: "Image links override",
      body: { name: "Image links override", type: "long_text" },
    },
    { name: "Override image", body: { name: "Override image", type: "file" } },
    {
      name: "Override hero crops",
      body: { name: "Override hero crops", type: "long_text" },
    },
    {
      name: "Publish snapshots",
      body: { name: "Publish snapshots", type: "long_text" },
    },
    {
      name: "Google calendar event id",
      body: { name: "Google calendar event id", type: "text" },
    },
  ];
}

function artistFields() {
  return [
    {
      name: "Slot",
      body: {
        name: "Slot",
        type: "single_select",
        select_options: [
          { value: "current", color: "green" },
          { value: "next", color: "blue" },
          { value: "previous", color: "gray" },
        ],
      },
    },
    { name: "Artist name", body: { name: "Artist name", type: "text" } },
    { name: "Start month", body: { name: "Start month", type: "text" } },
    { name: "End month", body: { name: "End month", type: "text" } },
    { name: "Website", body: { name: "Website", type: "url" } },
    { name: "Profile", body: { name: "Profile", type: "long_text" } },
    { name: "Bio", body: { name: "Bio", type: "long_text" } },
    { name: "Portrait", body: { name: "Portrait", type: "file" } },
    { name: "Art", body: { name: "Art", type: "file" } },
    { name: "Gwenda photos", body: { name: "Gwenda photos", type: "file" } },
  ];
}

function supplierFields() {
  return [
    { name: "Website", body: { name: "Website", type: "url" } },
    { name: "Notes", body: { name: "Notes", type: "text" } },
  ];
}

function userFields() {
  return [
    { name: "Email", body: { name: "Email", type: "email" } },
    { name: "Active", body: { name: "Active", type: "boolean" } },
  ];
}

function inventorySupplierFields(inventoryTableId, suppliersTableId) {
  return [
    {
      name: "Inventory",
      body: {
        name: "Inventory",
        type: "link_row",
        link_row_table_id: inventoryTableId,
        has_related_field: true,
      },
    },
    {
      name: "Supplier",
      body: {
        name: "Supplier",
        type: "link_row",
        link_row_table_id: suppliersTableId,
        has_related_field: true,
      },
    },
    { name: "Product URL", body: { name: "Product URL", type: "url" } },
    { name: "SKU", body: { name: "SKU", type: "text" } },
    { name: "Pack", body: { name: "Pack", type: "text" } },
    {
      name: "Price",
      body: {
        name: "Price",
        type: "number",
        number_decimal_places: 2,
        number_negative: false,
      },
    },
  ];
}

async function listRows(apiBase, jwt, tableId) {
  const rows = [];
  let page = 1;
  for (;;) {
    const payload = await baserowRequest(
      apiBase,
      jwt,
      `/api/database/rows/table/${tableId}/?user_field_names=true&size=200&page=${page}`,
    );
    rows.push(...(payload.results || []));
    if (!payload?.next) break;
    page += 1;
    if (page > 50) break;
  }
  return rows;
}

function linkId(value) {
  if (Array.isArray(value) && value[0]) {
    const first = value[0];
    if (typeof first === "number") return first;
    if (first && typeof first === "object" && first.id != null)
      return Number(first.id);
  }
  return null;
}

async function seedSuppliers(apiBase, jwt, suppliersTableId) {
  const existing = await listRows(apiBase, jwt, suppliersTableId);
  const byName = new Map(
    existing.map((row) => [
      String(row.Name || "")
        .trim()
        .toLowerCase(),
      row,
    ]),
  );
  for (const seed of SEED_SUPPLIERS) {
    const key = seed.name.toLowerCase();
    const hit = byName.get(key);
    if (hit) {
      const website = String(hit.Website || "").trim();
      if (seed.website && !website) {
        await baserowRequest(
          apiBase,
          jwt,
          `/api/database/rows/table/${suppliersTableId}/${hit.id}/?user_field_names=true`,
          {
            method: "PATCH",
            body: JSON.stringify({ Website: seed.website }),
          },
        );
        console.log(`  ~ ${seed.name} (website)`);
      } else {
        console.log(`  ✓ ${seed.name}`);
      }
      continue;
    }
    const created = await baserowRequest(
      apiBase,
      jwt,
      `/api/database/rows/table/${suppliersTableId}/?user_field_names=true`,
      {
        method: "POST",
        body: JSON.stringify({
          Name: seed.name,
          Website: seed.website || "",
          Notes: "",
        }),
      },
    );
    byName.set(key, created);
    console.log(`  + ${seed.name}`);
  }
  return byName;
}

async function seedUsers(apiBase, jwt, usersTableId) {
  const emails = parseEmailList(
    process.env.OPS_ALLOWED_EMAILS || process.env.AUTH0_ALLOWED_EMAILS,
  );
  const existing = await listRows(apiBase, jwt, usersTableId);
  const byEmail = new Set();
  for (const row of existing) {
    const email = String(row.Email || "")
      .trim()
      .toLowerCase();
    if (!email) {
      await baserowRequest(
        apiBase,
        jwt,
        `/api/database/rows/table/${usersTableId}/${row.id}/`,
        { method: "DELETE" },
      );
      console.log("  − empty starter row");
      continue;
    }
    byEmail.add(email);
  }
  if (!emails.length && byEmail.size === 0) {
    console.log(
      "  (empty) Add Email + Active in Baserow Users before anyone can sign in on production.",
    );
    return;
  }
  for (const email of emails) {
    if (byEmail.has(email)) {
      console.log(`  ✓ ${email}`);
      continue;
    }
    await baserowRequest(
      apiBase,
      jwt,
      `/api/database/rows/table/${usersTableId}/?user_field_names=true`,
      {
        method: "POST",
        body: JSON.stringify({
          Name: email,
          Email: email,
          Active: true,
        }),
      },
    );
    byEmail.add(email);
    console.log(`  + ${email}`);
  }
}

async function findOrCreateSupplier(
  apiBase,
  jwt,
  suppliersTableId,
  byName,
  hint,
) {
  const name = String(hint?.name || "").trim();
  if (!name) return null;
  const key = name.toLowerCase();
  const hit = byName.get(key);
  if (hit) {
    const website = String(hit.Website || "").trim();
    if (hint.website && !website) {
      const updated = await baserowRequest(
        apiBase,
        jwt,
        `/api/database/rows/table/${suppliersTableId}/${hit.id}/?user_field_names=true`,
        {
          method: "PATCH",
          body: JSON.stringify({ Website: hint.website }),
        },
      );
      byName.set(key, updated);
      return updated;
    }
    return hit;
  }
  const created = await baserowRequest(
    apiBase,
    jwt,
    `/api/database/rows/table/${suppliersTableId}/?user_field_names=true`,
    {
      method: "POST",
      body: JSON.stringify({
        Name: name,
        Website: hint.website || "",
        Notes: "",
      }),
    },
  );
  byName.set(key, created);
  console.log(`  + supplier ${name}`);
  return created;
}

function lwcFieldsForUrl(url) {
  const sku = skuFromProductUrl(url);
  const hit = sku ? LWC_PRICES[sku] : null;
  const fields = {};
  if (sku) fields.SKU = sku;
  if (hit?.pack) fields.Pack = hit.pack;
  if (typeof hit?.price === "number") fields.Price = hit.price;
  return fields;
}

function leftoverProductUrls(row) {
  const dedicated = String(row["Supplier links"] || "");
  const notes = String(row.Notes || "");
  const urls = [];
  const seen = new Set();
  for (const line of dedicated
    .split(/\r?\n/)
    .concat(looksLikeOnlyUrls(notes) ? notes.split(/\r?\n/) : [])) {
    const url = parseProductUrl(line);
    if (!url) continue;
    const key = url.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    urls.push(url);
  }
  return urls;
}

async function migrateMenuPlacements(
  apiBase,
  jwt,
  { items, posMenus, menuPlacements },
) {
  const existing = await listRows(apiBase, jwt, menuPlacements.id);
  const covered = new Set(
    existing
      .map((row) => linkIdsFrom(row["Menu item"])[0])
      .filter((id) => Number.isFinite(id)),
  );
  const itemRows = await listRows(apiBase, jwt, items.id);
  const missing = itemRows.filter((item) => !covered.has(item.id));
  if (!missing.length) {
    console.log(`  ✓ placements already migrated (${existing.length} rows)`);
    return;
  }
  const posMenuRows = await listRows(apiBase, jwt, posMenus.id);
  const defaultPos =
    posMenuRows.find((row) => Boolean(row.Default)) ||
    posMenuRows.find(
      (row) =>
        String(row.Name || "")
          .trim()
          .toLowerCase() === DEFAULT_POS_MENU_NAME.toLowerCase(),
    ) ||
    posMenuRows[0];
  let created = 0;
  for (const item of missing) {
    const itemId = item.id;
    const sectionIds = linkIdsFrom(item.Section);
    const sectionId = sectionIds[0] || null;
    const onPrint =
      item["On print menu"] != null ? Boolean(item["On print menu"]) : true;
    const onDigital =
      item["On digital menu"] != null ? Boolean(item["On digital menu"]) : true;
    const posLinks = linkIdsFrom(item["POS menus"]);
    const screenRaw = String(item["Lightspeed menu/screen"] || "").trim();
    const screens = screenRaw
      ? screenRaw
          .split(",")
          .map((part) => part.trim().replace(/##/g, "/"))
          .filter(Boolean)
      : [];
    const screen = screens[0] || "Signature Cocktails";

    async function add(fields) {
      await baserowRequest(
        apiBase,
        jwt,
        `/api/database/rows/table/${menuPlacements.id}/?user_field_names=true`,
        { method: "POST", body: JSON.stringify(fields) },
      );
      created += 1;
    }

    if (onPrint && sectionId) {
      await add({
        "Menu item": [itemId],
        Channel: "print",
        Section: [sectionId],
        Order: 0,
      });
    }
    if (onDigital && sectionId) {
      await add({
        "Menu item": [itemId],
        Channel: "digital",
        Section: [sectionId],
        Order: 0,
      });
    }
    const posIds = posLinks.length
      ? posLinks
      : defaultPos
        ? [defaultPos.id]
        : [];
    for (const [index, posMenuId] of posIds.entries()) {
      await add({
        "Menu item": [itemId],
        Channel: "pos",
        "POS menu": [posMenuId],
        "POS screen": screens[index] || screen,
        Order: index,
      });
    }
  }
  console.log(`  + ${created} placement row(s) for ${missing.length} item(s)`);
}

async function migrateSupplierLinks(
  apiBase,
  jwt,
  { inventory, suppliers, inventorySuppliers },
  supplierByName,
) {
  const fields = await baserowRequest(
    apiBase,
    jwt,
    `/api/database/fields/table/${inventory.id}/`,
  );
  const hasLegacy = (fields || []).some(
    (field) => field.name === "Supplier links",
  );
  const inventoryRows = await listRows(apiBase, jwt, inventory.id);
  const linkRows = await listRows(apiBase, jwt, inventorySuppliers.id);
  const existingByUrl = new Map(
    linkRows.map((row) => {
      const invId = linkId(row.Inventory);
      const url = parseProductUrl(row["Product URL"]).toLowerCase();
      return [`${invId}|${url}`, row];
    }),
  );

  let created = 0;
  let priced = 0;
  for (const row of inventoryRows) {
    const urls = leftoverProductUrls(row);
    if (!urls.length) continue;
    for (const url of urls) {
      const lwc = lwcFieldsForUrl(url);
      const hint =
        lwc.Price != null
          ? {
              name: "LWC Drinks",
              website: "https://www.lwc-drinks.co.uk",
              productUrl: url,
            }
          : supplierFromUrl(url);
      const supplier = await findOrCreateSupplier(
        apiBase,
        jwt,
        suppliers.id,
        supplierByName,
        hint,
      );
      if (!supplier) continue;
      const urlKey = `${row.id}|${url.toLowerCase()}`;
      const payload = {
        Name: String(supplier.Name || hint.name || "").trim(),
        Inventory: [Number(row.id)],
        Supplier: [Number(supplier.id)],
        "Product URL": url,
        ...lwc,
      };
      const current = existingByUrl.get(urlKey);
      if (current) {
        const needsPrice =
          Number(current.Price) !== Number(lwc.Price ?? current.Price) ||
          String(current.SKU || "") !== String(lwc.SKU || "") ||
          String(current.Pack || "") !== String(lwc.Pack || "");
        if (needsPrice) {
          await baserowRequest(
            apiBase,
            jwt,
            `/api/database/rows/table/${inventorySuppliers.id}/${current.id}/?user_field_names=true`,
            { method: "PATCH", body: JSON.stringify(payload) },
          );
          priced += 1;
        }
        continue;
      }
      const createdRow = await baserowRequest(
        apiBase,
        jwt,
        `/api/database/rows/table/${inventorySuppliers.id}/?user_field_names=true`,
        { method: "POST", body: JSON.stringify(payload) },
      );
      existingByUrl.set(urlKey, createdRow);
      created += 1;
    }

    if (looksLikeOnlyUrls(row.Notes) && String(row.Notes || "").trim()) {
      await baserowRequest(
        apiBase,
        jwt,
        `/api/database/rows/table/${inventory.id}/${row.id}/?user_field_names=true`,
        { method: "PATCH", body: JSON.stringify({ Notes: "" }) },
      );
    }
  }

  if (created) console.log(`  + ${created} inventory–supplier link(s)`);
  if (priced) console.log(`  ~ ${priced} link(s) priced from LWC list`);
  if (!created && !priced) console.log("  ✓ links already migrated");

  if (hasLegacy) {
    const field = (fields || []).find((item) => item.name === "Supplier links");
    await baserowRequest(apiBase, jwt, `/api/database/fields/${field.id}/`, {
      method: "DELETE",
    });
    console.log("  − removed Inventory field “Supplier links”");
  }
}

async function main() {
  const apiBase = (readEnv("BASEROW_API_URL") || DEFAULT_BASEROW_API).replace(
    /\/$/,
    "",
  );
  const jwt = await getBaserowJwt(apiBase);

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
  const items = await findOrCreateTable(
    apiBase,
    jwt,
    databaseId,
    tables,
    TABLE_ITEMS,
  );
  const inventory = await findOrCreateTable(
    apiBase,
    jwt,
    databaseId,
    tables,
    TABLE_INVENTORY,
  );
  const suppliers = await findOrCreateTable(
    apiBase,
    jwt,
    databaseId,
    tables,
    TABLE_SUPPLIERS,
  );
  const inventorySuppliers = await findOrCreateTable(
    apiBase,
    jwt,
    databaseId,
    tables,
    TABLE_INVENTORY_SUPPLIERS,
  );
  const ingredients = await findOrCreateTable(
    apiBase,
    jwt,
    databaseId,
    tables,
    TABLE_INGREDIENTS,
  );
  const users = await findOrCreateTable(
    apiBase,
    jwt,
    databaseId,
    tables,
    TABLE_USERS,
  );
  const posMenus = await findOrCreateTable(
    apiBase,
    jwt,
    databaseId,
    tables,
    TABLE_POS_MENUS,
  );
  const menuPlacements = await findOrCreateTable(
    apiBase,
    jwt,
    databaseId,
    tables,
    TABLE_MENU_PLACEMENTS,
  );

  console.log(`Fields on ${TABLE_SECTIONS}:`);
  await ensureFields(apiBase, jwt, sections.id, sectionFields(sections.id));
  console.log(`Fields on ${TABLE_ITEMS}:`);
  const createdItemFields = await ensureFields(
    apiBase,
    jwt,
    items.id,
    itemFields(sections.id, posMenus.id),
  );
  if (createdItemFields.includes("On print menu")) {
    await defaultBooleanField(apiBase, jwt, items.id, "On print menu", true);
  }
  console.log(`Fields on ${TABLE_INVENTORY}:`);
  await ensureFields(apiBase, jwt, inventory.id, inventoryFields());
  console.log(`Fields on ${TABLE_SUPPLIERS}:`);
  await ensureFields(apiBase, jwt, suppliers.id, supplierFields());
  console.log(`Fields on ${TABLE_INVENTORY_SUPPLIERS}:`);
  await ensureFields(
    apiBase,
    jwt,
    inventorySuppliers.id,
    inventorySupplierFields(inventory.id, suppliers.id),
  );
  console.log(`Fields on ${TABLE_INGREDIENTS}:`);
  await ensureFields(
    apiBase,
    jwt,
    ingredients.id,
    ingredientFields(items.id, inventory.id),
  );
  console.log(`Fields on ${TABLE_USERS}:`);
  await ensureFields(apiBase, jwt, users.id, userFields());
  console.log(`Fields on ${TABLE_POS_MENUS}:`);
  await ensureFields(apiBase, jwt, posMenus.id, posMenuFields());
  console.log(`Fields on ${TABLE_MENU_PLACEMENTS}:`);
  await ensureFields(
    apiBase,
    jwt,
    menuPlacements.id,
    menuPlacementFields(items.id, sections.id, posMenus.id),
  );
  const events = await findOrCreateTable(
    apiBase,
    jwt,
    databaseId,
    tables,
    TABLE_EVENTS,
  );
  const eventDates = await findOrCreateTable(
    apiBase,
    jwt,
    databaseId,
    tables,
    TABLE_EVENT_DATES,
  );
  console.log(`Fields on ${TABLE_EVENTS}:`);
  await ensureFields(apiBase, jwt, events.id, eventFields());
  console.log(`Fields on ${TABLE_EVENT_DATES}:`);
  await ensureFields(apiBase, jwt, eventDates.id, eventDateFields(events.id));
  const artists = await findOrCreateTable(
    apiBase,
    jwt,
    databaseId,
    tables,
    TABLE_ARTISTS,
  );
  console.log(`Fields on ${TABLE_ARTISTS}:`);
  await ensureFields(apiBase, jwt, artists.id, artistFields());
  console.log(`Rows on ${TABLE_POS_MENUS}:`);
  await seedFallMenu(apiBase, jwt, posMenus.id, items.id, {
    linkEmptyItems: createdItemFields.includes("POS menus"),
  });
  console.log(`Migrate menu → placements:`);
  await migrateMenuPlacements(apiBase, jwt, {
    items,
    posMenus,
    menuPlacements,
  });

  console.log(`Rows on ${TABLE_SUPPLIERS}:`);
  const supplierByName = await seedSuppliers(apiBase, jwt, suppliers.id);
  console.log(`Rows on ${TABLE_USERS}:`);
  await seedUsers(apiBase, jwt, users.id);
  console.log(`Migrate inventory → supplier links:`);
  await migrateSupplierLinks(
    apiBase,
    jwt,
    { inventory, suppliers, inventorySuppliers },
    supplierByName,
  );

  console.log("");
  console.log("Gwenda Ops menu tables ready.");
  console.log(`Database: https://baserow.io/database/${databaseId}/`);
  console.log(`  ${TABLE_SECTIONS} → ${sections.id}`);
  console.log(`  ${TABLE_ITEMS} → ${items.id}`);
  console.log(`  ${TABLE_INVENTORY} → ${inventory.id}`);
  console.log(`  ${TABLE_SUPPLIERS} → ${suppliers.id}`);
  console.log(`  ${TABLE_INVENTORY_SUPPLIERS} → ${inventorySuppliers.id}`);
  console.log(`  ${TABLE_INGREDIENTS} → ${ingredients.id}`);
  console.log(`  ${TABLE_USERS} → ${users.id}`);
  console.log(`  ${TABLE_POS_MENUS} → ${posMenus.id}`);
  console.log(`  ${TABLE_MENU_PLACEMENTS} → ${menuPlacements.id}`);
  console.log(`  ${TABLE_EVENTS} → ${events.id}`);
  console.log(`  ${TABLE_EVENT_DATES} → ${eventDates.id}`);
  console.log(`  ${TABLE_ARTISTS} → ${artists.id}`);
  console.log("");

  const envLines = [`BASEROW_OPS_DATABASE_ID=${databaseId}`];
  await maybeWriteEnv(envLines);
  // wrangler.toml is production Pages config. Never point it at a local clone.
  if (String(databaseId) === "556507") {
    await maybeWriteWranglerVars({
      BASEROW_OPS_DATABASE_ID: String(databaseId),
    });
  } else {
    console.log(
      `Skipping wrangler.toml update (database ${databaseId} is not production 556507).`,
    );
  }
  await maybeStripTableIdEnvKeys();

  console.log(
    "Table ids are resolved by name at runtime (no env/wrangler map).",
  );
  console.log(
    "Next: npm run setup:ops  (pushes Baserow API key + deploy secrets to gwenda-ops Pages)",
  );
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
        console.log(
          `Keeping existing ${key}=${current.trim()} (new value would be ${value})`,
        );
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

function upsertTomlVars(text, vars) {
  let next = text;
  for (const [key, value] of Object.entries(vars)) {
    const line = `${key} = "${value}"`;
    const pattern = new RegExp(`^${key}\\s*=\\s*.*$`, "gm");
    if (pattern.test(next)) {
      next = next.replace(pattern, line);
      continue;
    }
    next = next.replace(/\[vars\]\n/, `[vars]\n${line}\n`);
  }
  return next;
}

async function maybeWriteWranglerVars(vars) {
  const { readFileSync, writeFileSync, existsSync } = await import("node:fs");
  const { resolve } = await import("node:path");
  const wranglerPath = resolve(process.cwd(), "ops/site/wrangler.toml");
  if (!existsSync(wranglerPath)) {
    console.log(
      "Add BASEROW_OPS_DATABASE_ID to ops/site/wrangler.toml [vars] if needed.",
    );
    return;
  }
  let next = readFileSync(wranglerPath, "utf8");
  const current = next;
  next = upsertTomlVars(next, vars);
  // Drop legacy per-table id vars; runtime resolves by name.
  for (const key of TABLE_ID_ENV_KEYS) {
    next = next.replace(new RegExp(`^${key}\\s*=\\s*.*\\n?`, "gm"), "");
  }
  if (next !== current) {
    writeFileSync(wranglerPath, next);
    console.log(`Wrote Baserow Ops database id into ${wranglerPath} [vars]`);
  } else {
    console.log("Baserow Ops database id already present in wrangler.toml");
  }
}

const TABLE_ID_ENV_KEYS = [
  "BASEROW_OPS_SECTIONS_TABLE_ID",
  "BASEROW_OPS_ITEMS_TABLE_ID",
  "BASEROW_OPS_INGREDIENTS_TABLE_ID",
  "BASEROW_OPS_INVENTORY_TABLE_ID",
  "BASEROW_OPS_SUPPLIERS_TABLE_ID",
  "BASEROW_OPS_INVENTORY_SUPPLIERS_TABLE_ID",
  "BASEROW_OPS_USERS_TABLE_ID",
  "BASEROW_OPS_CONFIG_TABLE_ID",
];

async function maybeStripTableIdEnvKeys() {
  const { readFileSync, writeFileSync, existsSync } = await import("node:fs");
  const { resolve } = await import("node:path");
  const envPath = resolve(process.cwd(), ".env");
  if (!existsSync(envPath)) return;
  let text = readFileSync(envPath, "utf8");
  const before = text;
  for (const key of TABLE_ID_ENV_KEYS) {
    text = text.replace(new RegExp(`^${key}=.*\\n?`, "gm"), "");
  }
  if (text !== before) {
    writeFileSync(envPath, text);
    console.log("Removed legacy BASEROW_OPS_*_TABLE_ID keys from .env");
  }
  try {
    const {
      ensureBwInstalled,
      ensureServer,
      ensureSession,
      syncVault,
      getItemOrNull,
      updateItemNotes,
      DEFAULT_LOCAL_ITEM,
    } = await import("./lib/bitwarden-env.mjs");
    ensureBwInstalled();
    ensureServer();
    ensureSession();
    syncVault();
    const item = getItemOrNull(DEFAULT_LOCAL_ITEM);
    if (!item?.notes) return;
    let notes = item.notes;
    const notesBefore = notes;
    for (const key of TABLE_ID_ENV_KEYS) {
      notes = notes.replace(new RegExp(`^${key}=.*\\n?`, "gm"), "");
    }
    if (notes !== notesBefore) {
      updateItemNotes(item, notes);
      console.log(
        `Stripped table id keys from Bitwarden ${DEFAULT_LOCAL_ITEM}.`,
      );
    }
  } catch {
    // Local .env strip is enough when vault is locked.
  }
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
    console.log(
      `Updated Bitwarden ${DEFAULT_LOCAL_ITEM} with Baserow Ops database id.`,
    );
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
