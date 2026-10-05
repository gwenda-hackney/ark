/**
 * One D1 table, declared once (#194): how a record's fields map to columns,
 * and the standard operations that follow from it. Feature adapters compose
 * these (one per table) and add only the queries their domain needs (#186).
 *
 *   const nights = d1Table({
 *     table: "event_dates",
 *     columns: {
 *       id: "int",
 *       eventId: "int",                                   // column event_id
 *       date: "date",
 *       overrides: "json",
 *       snapshots: { column: "publish_snapshots", type: "json" },
 *       calendarLinked: "bool",
 *     },
 *     orderBy: "date, id",
 *   });
 *   await nights.list(db, { where: "event_id = ?", params: [7] });
 *
 * Types (db/README.md): text, int, bool (0/1), json (TEXT), date (ISO TEXT).
 * Column names default to the field name in snake_case. Every table has an
 * integer `id`. The *Statement methods return prepared statements, so an
 * adapter can put changes to several tables in one batch (one transaction).
 */
import {
  MAX_PARAMS,
  all,
  batch,
  first,
  fromBool,
  fromJson,
  identifier,
  insertRows,
  statement,
  toBool,
  toJson,
} from "./d1.js";

export const COLUMN_TYPES = ["text", "int", "bool", "json", "date"];

/** Statements per batch when copying a whole table (the free plan's 50 queries per request). */
export const COPY_BATCH = 50;

const snake = (key) =>
  key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);

const ENCODE = {
  text: (value) => (value == null ? null : String(value)),
  date: (value) => (value == null || value === "" ? null : String(value)),
  int: (value) => (value == null || value === "" ? null : Number(value)),
  bool: (value) => toBool(value),
  json: (value) => toJson(value),
};

const DECODE = {
  text: (value) => value ?? null,
  date: (value) => value ?? null,
  int: (value) => (value == null ? null : Number(value)),
  bool: (value) => fromBool(value),
  json: (value) => fromJson(value, null),
};

function normalizeColumns(table, columns) {
  const out = Object.entries(columns).map(([key, spec]) => {
    const { column = snake(key), type } =
      typeof spec === "string" ? { type: spec } : spec;
    if (!COLUMN_TYPES.includes(type)) {
      throw new Error(
        `${table}.${key}: type must be one of ${COLUMN_TYPES.join(", ")}.`,
      );
    }
    return { key, column: identifier(column), type };
  });
  const id = out.find((c) => c.key === "id");
  if (!id || id.column !== "id" || id.type !== "int") {
    throw new Error(`${table}: needs an integer "id" column.`);
  }
  if (out.length > MAX_PARAMS)
    throw new Error(`${table}: more than ${MAX_PARAMS} columns.`);
  return out;
}

/**
 * @param {{ table: string, columns: Record<string, string | { column?: string, type: string }>,
 *   orderBy?: string }} definition
 */
export function d1Table({ table, columns, orderBy = "id" }) {
  identifier(table);
  const specs = normalizeColumns(table, columns);
  const byKey = new Map(specs.map((spec) => [spec.key, spec]));
  const columnNames = specs.map((spec) => spec.column);
  const selectList = columnNames.join(", ");

  /** A row from D1 → a record. */
  function toRecord(row) {
    if (!row) return null;
    const record = {};
    for (const spec of specs)
      record[spec.key] = DECODE[spec.type](row[spec.column]);
    return record;
  }

  /** Record fields → row values; fields the table doesn't have are ignored. */
  function toRow(fields) {
    const row = {};
    for (const [key, value] of Object.entries(fields)) {
      const spec = byKey.get(key);
      if (spec) row[spec.column] = ENCODE[spec.type](value);
    }
    return row;
  }

  function selectSql({ where = "", order = orderBy } = {}) {
    return `SELECT ${selectList} FROM ${table}${where ? ` WHERE ${where}` : ""}${order ? ` ORDER BY ${order}` : ""}`;
  }

  function insertStatement(db, fields) {
    const row = toRow(fields);
    const cols = Object.keys(row);
    if (!cols.length)
      return statement(
        db,
        `INSERT INTO ${table} DEFAULT VALUES RETURNING ${selectList}`,
      );
    return statement(
      db,
      `INSERT INTO ${table} (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")}) RETURNING ${selectList}`,
      cols.map((col) => row[col]),
    );
  }

  function patchStatement(db, id, fields) {
    const { id: _ignored, ...rest } = toRow(fields);
    const cols = Object.keys(rest);
    if (!cols.length) return null;
    return statement(
      db,
      `UPDATE ${table} SET ${cols.map((col) => `${col} = ?`).join(", ")} WHERE id = ? RETURNING ${selectList}`,
      [...cols.map((col) => rest[col]), Number(id)],
    );
  }

  function removeStatement(db, id) {
    return statement(db, `DELETE FROM ${table} WHERE id = ?`, [Number(id)]);
  }

  /**
   * INSERT, or UPDATE the given fields when `conflict` columns already match
   * a row (e.g. ["email"]). The id is never overwritten.
   */
  function upsertStatement(db, fields, conflict) {
    const keyColumns = conflict.map(
      (key) => byKey.get(key)?.column ?? identifier(key),
    );
    const row = toRow(fields);
    const cols = Object.keys(row);
    const updates = cols.filter(
      (col) => col !== "id" && !keyColumns.includes(col),
    );
    return statement(
      db,
      `INSERT INTO ${table} (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")}) ` +
        `ON CONFLICT(${keyColumns.join(", ")}) DO ` +
        (updates.length
          ? `UPDATE SET ${updates.map((col) => `${col} = excluded.${col}`).join(", ")}`
          : "NOTHING") +
        ` RETURNING ${selectList}`,
      cols.map((col) => row[col]),
    );
  }

  /** Copy in: delete every row, then insert `records` with their ids. */
  function importStatements(db, records) {
    const rows = records.map((record) => toRow(record));
    return [
      statement(db, `DELETE FROM ${table}`),
      ...insertRows(db, table, columnNames, rows),
    ];
  }

  return {
    table,
    columns: specs,
    toRecord,
    toRow,
    async get(db, id) {
      return toRecord(
        await first(db, selectSql({ where: "id = ?" }), [Number(id)]),
      );
    },
    /** Records matching `where` (SQL on column names, with ? params), in orderBy order. */
    async list(db, { where = "", params = [], order } = {}) {
      return (await all(db, selectSql({ where, order }), params)).map(toRecord);
    },
    async insert(db, fields) {
      return toRecord((await insertStatement(db, fields).first()) ?? null);
    },
    /** The updated record, or null when there is no such row. Only the given fields change. */
    async patch(db, id, fields) {
      const stmt = patchStatement(db, id, fields);
      if (!stmt) return this.get(db, id);
      return toRecord((await stmt.first()) ?? null);
    },
    async remove(db, id) {
      await removeStatement(db, id).run();
    },
    async upsert(db, fields, conflict) {
      return toRecord(
        (await upsertStatement(db, fields, conflict).first()) ?? null,
      );
    },
    insertStatement,
    patchStatement,
    removeStatement,
    upsertStatement,
    importStatements,
    /** Every record, by id: what a copy carries. */
    async exportAll(db) {
      return (await all(db, selectSql({ order: "id" }))).map(toRecord);
    },
  };
}

/**
 * Replace several tables' contents with `records`, keeping ids. Pairs are in
 * dependency order (parents first): rows are deleted children first, then
 * inserted parents first, so foreign keys hold at every step. Statements go
 * in batches of COPY_BATCH; with more than that, the copy is not one
 * transaction, so run it while writes to the feature are frozen.
 * @param {[ReturnType<typeof d1Table>, object[]][]} pairs
 */
export async function importTables(db, pairs, { batchSize = COPY_BATCH } = {}) {
  const deletes = [...pairs]
    .reverse()
    .map(([t]) => statement(db, `DELETE FROM ${t.table}`));
  const inserts = pairs.flatMap(([t, records]) =>
    t.importStatements(db, records).slice(1),
  );
  const statements = [...deletes, ...inserts];
  for (let i = 0; i < statements.length; i += batchSize) {
    await batch(db, statements.slice(i, i + batchSize));
  }
  return { statements: statements.length };
}

/** Every listed table's records, keyed by table: one feature's snapshot. */
export async function exportTables(db, tables) {
  const out = {};
  for (const t of tables) out[t.table] = await t.exportAll(db);
  return out;
}
