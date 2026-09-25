/**
 * Baserow database drift: production against its non-production copy.
 *
 * Ops: production Ops DB vs the Gwenda Dev copy that local ops uses.
 * Website: production Website DB vs Website Staging (gwenda-staging).
 *
 * Production is expected to move on (new orders, stock, sign-ups). This only
 * answers "is the copy still the same as production?" per table: the columns,
 * the row count, and how many rows exist on one side only. Row ids differ
 * between copies, so rows are compared by their values, with links compared by
 * the names they show.
 */
import { OPS_PRODUCTION_DATABASE_ID, baserowFetch } from "./baserow.js";

const PAGE_SIZE = 200;

/** Database ids, overridable per environment. */
export function databasePairs(env = {}) {
  const opsToken = env.BASEROW_API_KEY || "";
  return {
    ops: {
      id: "ops",
      label: "Ops",
      copyLabel: "Gwenda Dev copy (local ops)",
      source: {
        label: "Production",
        databaseId: env.BASEROW_OPS_DATABASE_ID_PRODUCTION || OPS_PRODUCTION_DATABASE_ID,
        token: opsToken,
      },
      target: {
        label: "Dev copy",
        databaseId: env.BASEROW_OPS_DEV_DATABASE_ID || "560292",
        token: env.BASEROW_OPS_DEV_API_KEY || "",
      },
      // Production-only by design: config moved to the Gwenda Config DB.
      ignoreTables: ["App Config"],
    },
    website: {
      id: "website",
      label: "Website",
      copyLabel: "Website Staging (gwenda-staging)",
      source: {
        label: "Production",
        databaseId: env.BASEROW_WEBSITE_DATABASE_ID_PRODUCTION || "461843",
        token: opsToken,
      },
      target: {
        label: "Staging",
        databaseId: env.BASEROW_WEBSITE_DATABASE_ID_STAGING || "564496",
        token: opsToken,
      },
      ignoreTables: [],
    },
  };
}

function withToken(env, token) {
  return { ...env, BASEROW_API_KEY: token };
}

const NUMERIC = /^-?\d+(\.\d+)?$/;

/**
 * Comparable form of one cell. Links and selects compare by what they show.
 * Empty text, null and empty lists are the same, and numbers compare by value
 * (copies can store "" vs null, or "2.00" vs "2").
 */
export function normalizeCell(value) {
  if (Array.isArray(value)) {
    if (!value.length) return null;
    return value
      .map((item) =>
        item && typeof item === "object"
          ? String(item.value ?? item.visible_name ?? item.name ?? "")
          : String(item ?? ""),
      )
      .sort();
  }
  if (value && typeof value === "object") {
    return String(value.value ?? value.name ?? JSON.stringify(value));
  }
  if (value === "" || value === undefined || value === null) return null;
  if (typeof value === "number") return String(value);
  if (typeof value === "string" && NUMERIC.test(value.trim())) return String(Number(value));
  return value;
}

export function rowKey(row, fields) {
  return JSON.stringify(fields.map((field) => normalizeCell(row[field])));
}

async function listTables(env, databaseId) {
  const tables = await baserowFetch(env, "/api/database/tables/all-tables/");
  return (tables || []).filter((table) => String(table.database_id) === String(databaseId));
}

async function listRows(env, tableId) {
  const rows = [];
  for (let page = 1; ; page += 1) {
    const data = await baserowFetch(
      env,
      `/api/database/rows/table/${tableId}/?user_field_names=true&size=${PAGE_SIZE}&page=${page}`,
    );
    rows.push(...(data?.results || []));
    if (!data?.next) break;
  }
  return rows;
}

function rowFields(rows) {
  const names = new Set();
  for (const row of rows) {
    for (const key of Object.keys(row)) if (key !== "id" && key !== "order") names.add(key);
  }
  return names;
}

/** Rows present on one side only, counted as a multiset. */
export function compareRows(sourceRows, targetRows) {
  const sourceFields = rowFields(sourceRows);
  const targetFields = rowFields(targetRows);
  const shared = [...sourceFields].filter((name) => targetFields.has(name)).sort();
  const counts = new Map();
  for (const row of sourceRows) {
    const key = rowKey(row, shared);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  let targetOnly = 0;
  for (const row of targetRows) {
    const key = rowKey(row, shared);
    const left = counts.get(key) || 0;
    if (left > 0) counts.set(key, left - 1);
    else targetOnly += 1;
  }
  let sourceOnly = 0;
  for (const left of counts.values()) sourceOnly += left;
  return {
    sourceOnly,
    targetOnly,
    missingColumns: [...sourceFields].filter((name) => !targetFields.has(name)).sort(),
    extraColumns: [...targetFields].filter((name) => !sourceFields.has(name)).sort(),
  };
}

async function readSide(env, side) {
  if (!side.token) {
    const error = new Error(`No Baserow token for the ${side.label.toLowerCase()} database here.`);
    error.status = 503;
    throw error;
  }
  const scoped = withToken(env, side.token);
  const tables = await listTables(scoped, side.databaseId);
  if (!tables.length) {
    const error = new Error(
      `This ops token cannot read the ${side.label.toLowerCase()} database (${side.databaseId}).`,
    );
    error.status = 503;
    throw error;
  }
  const byName = new Map();
  for (const table of tables) {
    byName.set(table.name, { id: table.id, rows: await listRows(scoped, table.id) });
  }
  return byName;
}

/** Compare one pair. Tables are matched by name. */
export async function compareDatabasePair(env, pairId) {
  const pair = databasePairs(env)[pairId];
  if (!pair) {
    const error = new Error(`Unknown database "${pairId}".`);
    error.status = 400;
    throw error;
  }
  const [source, target] = await Promise.all([
    readSide(env, pair.source),
    readSide(env, pair.target),
  ]);
  const ignore = new Set(pair.ignoreTables);
  const names = [...new Set([...source.keys(), ...target.keys()])]
    .filter((name) => !ignore.has(name))
    .sort();
  const tables = names.map((name) => {
    const left = source.get(name);
    const right = target.get(name);
    if (!left || !right) {
      return {
        name,
        status: left ? "missing" : "extra",
        sourceRows: left?.rows.length ?? 0,
        targetRows: right?.rows.length ?? 0,
        sourceOnly: left?.rows.length ?? 0,
        targetOnly: right?.rows.length ?? 0,
        missingColumns: [],
        extraColumns: [],
      };
    }
    const diff = compareRows(left.rows, right.rows);
    const same =
      !diff.sourceOnly && !diff.targetOnly && !diff.missingColumns.length && !diff.extraColumns.length;
    return {
      name,
      status: same ? "same" : "different",
      sourceRows: left.rows.length,
      targetRows: right.rows.length,
      ...diff,
    };
  });
  return {
    id: pair.id,
    label: pair.label,
    copyLabel: pair.copyLabel,
    source: { label: pair.source.label, databaseId: pair.source.databaseId },
    target: { label: pair.target.label, databaseId: pair.target.databaseId },
    inSync: tables.every((table) => table.status === "same"),
    tables,
    checkedAt: new Date().toISOString(),
  };
}
