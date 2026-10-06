/**
 * Small helpers over a D1 database (#127). `db` is anything shaped like D1:
 * the Workers binding (env.OPS_DB), the REST adapter (./d1-http.js) or the
 * test database (./testing/d1-sqlite.js). Only repository adapters use these;
 * nothing else knows tables or columns (#186).
 *
 * D1 limits these work around: at most 100 bound parameters per statement,
 * and statements of at most 100 KB. A batch is one transaction.
 */

export const MAX_PARAMS = 100;

const IDENTIFIER = /^[a-z_][a-z0-9_]*$/;

/** Table and column names come from code, never from input; refuse anything else. */
export function identifier(name) {
  if (!IDENTIFIER.test(String(name)))
    throw new Error(`Not a safe SQL identifier: ${name}`);
  return name;
}

export function statement(db, sql, params = []) {
  const prepared = db.prepare(sql);
  return params.length ? prepared.bind(...params) : prepared;
}

/** Every row the query returns. */
export async function all(db, sql, params = []) {
  const result = await statement(db, sql, params).all();
  return result?.results ?? [];
}

/** The first row, or null. */
export async function first(db, sql, params = []) {
  return (await statement(db, sql, params).first()) ?? null;
}

/** Runs a write; returns D1's meta ({ changes, last_row_id, ... }). */
export async function run(db, sql, params = []) {
  const result = await statement(db, sql, params).run();
  return result?.meta ?? {};
}

/** Runs prepared statements as one transaction. */
export async function batch(db, statements) {
  if (!statements.length) return [];
  return db.batch(statements);
}

/**
 * INSERT statements for `rows` (objects keyed by column), split so each stays
 * under MAX_PARAMS. Pass them to batch(). `conflict` is appended as is, for
 * example "ON CONFLICT(email) DO NOTHING".
 */
export function insertRows(db, table, columns, rows, { conflict = "" } = {}) {
  identifier(table);
  columns.forEach(identifier);
  if (!columns.length) throw new Error(`insertRows(${table}): no columns.`);
  if (columns.length > MAX_PARAMS)
    throw new Error(`insertRows(${table}): more than ${MAX_PARAMS} columns.`);
  const perStatement = Math.floor(MAX_PARAMS / columns.length);
  const placeholders = `(${columns.map(() => "?").join(", ")})`;
  const out = [];
  for (let i = 0; i < rows.length; i += perStatement) {
    const chunk = rows.slice(i, i + perStatement);
    const sql =
      `INSERT INTO ${table} (${columns.join(", ")}) VALUES ` +
      chunk.map(() => placeholders).join(", ") +
      (conflict ? ` ${conflict}` : "");
    out.push(
      statement(
        db,
        sql,
        chunk.flatMap((row) => columns.map((column) => row[column] ?? null)),
      ),
    );
  }
  return out;
}

/**
 * One parameter for a list of ids, so `IN` never hits the parameter limit:
 *   WHERE id IN (SELECT value FROM json_each(?))
 */
export function idList(ids) {
  return JSON.stringify([...ids].map(Number));
}

/** JSON column: text in, value out. */
export function toJson(value) {
  return value == null ? null : JSON.stringify(value);
}

export function fromJson(text, fallback = null) {
  if (text == null || text === "") return fallback;
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

/** Boolean column: SQLite has none, so 0 or 1. */
export function toBool(value) {
  return value ? 1 : 0;
}

export function fromBool(value) {
  return value === 1 || value === true || value === "1";
}

/** Now as ISO-8601 UTC, the format every *_at column holds. */
export function nowIso(now = new Date()) {
  return now.toISOString();
}

/**
 * An UPDATE for the given fields only. `columns` maps record keys to column
 * names; keys not in it are ignored, so callers can pass a whole record.
 * Returns null when nothing would change.
 */
export function patchStatement(db, table, id, patch, columns) {
  identifier(table);
  const sets = [];
  const params = [];
  for (const [key, column] of Object.entries(columns)) {
    if (!(key in patch)) continue;
    sets.push(`${identifier(column)} = ?`);
    params.push(patch[key] ?? null);
  }
  if (!sets.length) return null;
  if (params.length + 1 > MAX_PARAMS)
    throw new Error(`patchStatement(${table}): too many fields.`);
  return statement(db, `UPDATE ${table} SET ${sets.join(", ")} WHERE id = ?`, [
    ...params,
    id,
  ]);
}
