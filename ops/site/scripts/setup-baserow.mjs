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
 *   BASEROW_WORKSPACE_NAME (default "Gwenda"; the Gwenda Ops database in it is
 *   reused by name or created)
 */
import { getBaserowJwt } from "../../../scripts/lib/baserow-jwt.mjs";
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
  TABLE_GUEST_ARTISTS,
} from "../../../shared/baserow.js";
import {
  GUEST_ARTIST_FIELDS,
  artistFields,
  eventDateFields,
  eventFields,
  ingredientFields,
  inventoryFields,
  inventorySupplierFields,
  itemFields,
  menuPlacementFields,
  posMenuFields,
  sectionFields,
  supplierFields,
  userFields,
} from "../src/platform/baserow-schema.js";
import {
  DEFAULT_POS_MENU_NAME,
  LEGACY_DEFAULT_POS_MENU_NAME,
} from "../src/menu/server/pos-menu-store.js";
import { parseEmailList } from "../../../scripts/lib/parse-email-list.mjs";
import {
  looksLikeOnlyUrls,
  SEED_SUPPLIERS,
  skuFromProductUrl,
  supplierFromUrl,
} from "../src/inventory/suppliers.js";
import { parseProductUrl } from "../../../shared/web-address.js";
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

/** The workspace to build in, by name (BASEROW_WORKSPACE_NAME, default "Gwenda"). */
async function resolveWorkspaceId(apiBase, jwt) {
  const name = readEnv("BASEROW_WORKSPACE_NAME") || "Gwenda";
  const workspaces = await listWorkspaces(apiBase, jwt);
  const found = workspaces.find(
    (workspace) => String(workspace.name).trim().toLowerCase() === name.toLowerCase(),
  );
  if (!found) {
    throw new Error(
      `Baserow workspace "${name}" not found. Visible: ${workspaces.map((w) => w.name).join(", ") || "none"}.`,
    );
  }
  console.log(`Using workspace ${found.name} (${found.id})`);
  return String(found.id);
}

async function findOrCreateOpsDatabase(apiBase, jwt) {
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

/** `create` overrides the new table's body (e.g. a table with only its key column). */
async function findOrCreateTable(apiBase, jwt, databaseId, tables, tableName, create = {}) {
  const existing = tables.find((table) => table.name === tableName);
  if (existing) {
    console.log(`Using existing table "${tableName}" (id ${existing.id}).`);
    return existing;
  }
  const created = await baserowRequest(
    apiBase,
    jwt,
    `/api/database/tables/database/${databaseId}/`,
    { method: "POST", body: JSON.stringify({ name: tableName, ...create }) },
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
  const guestArtists = await findOrCreateTable(
    apiBase,
    jwt,
    databaseId,
    tables,
    TABLE_GUEST_ARTISTS,
    { data: [["Email"]], first_row_header: true },
  );
  console.log(`Fields on ${TABLE_GUEST_ARTISTS}:`);
  await ensureFields(
    apiBase,
    jwt,
    guestArtists.id,
    GUEST_ARTIST_FIELDS.map((body) => ({ name: body.name, body })),
  );
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


  console.log(
    "Database and table ids are resolved by name at runtime; nothing to store.",
  );
  console.log(
    "Next: npm run setup:ops  (pushes Baserow API key + deploy secrets to gwenda-ops Pages)",
  );
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

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
