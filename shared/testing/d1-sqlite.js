/**
 * A real SQLite database shaped like D1, for tests (#127). It applies the
 * same SQL migrations deploys apply (db/<role>/migrations/*.sql), so a test
 * that passes here fails for the same reasons D1 would:
 * - foreign keys are on (D1 always enforces them);
 * - a batch is one transaction: one failing statement undoes the rest;
 * - binding `undefined` throws, as D1 does; booleans bind as 0/1.
 *
 * Node's built-in `node:sqlite`; nothing to install.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

const DB_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../db");

/** The SQL migration files for a role, in the order wrangler applies them. */
export function migrationFiles(role, root = DB_ROOT) {
  const dir = join(root, role, "migrations");
  return readdirSync(dir)
    .filter((file) => file.endsWith(".sql"))
    .sort()
    .map((file) => join(dir, file));
}

function bindable(value, index) {
  if (value === undefined)
    throw new Error(`D1_TYPE_ERROR: parameter ${index + 1} is undefined.`);
  if (typeof value === "boolean") return value ? 1 : 0;
  return value;
}

const plain = (row) => (row ? { ...row } : row);

/**
 * @param {"ops" | "website" | "config" | null} role  migrations to apply; null for none
 * @param {{ root?: string }} [opts]
 */
export function createTestD1(role, { root } = {}) {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON;");
  if (role)
    for (const file of migrationFiles(role, root))
      sqlite.exec(readFileSync(file, "utf8"));

  function prepared(sql, params = []) {
    const execute = () => sqlite.prepare(sql);
    const values = () => params.map(bindable);
    return {
      sql,
      params,
      bind: (...next) => prepared(sql, next),
      async all() {
        const results = execute()
          .all(...values())
          .map(plain);
        return { results, success: true, meta: { changes: 0, last_row_id: 0 } };
      },
      async first(column) {
        const row = plain(execute().get(...values())) ?? null;
        return column && row ? (row[column] ?? null) : row;
      },
      async run() {
        const info = execute().run(...values());
        return {
          success: true,
          meta: {
            changes: Number(info.changes),
            last_row_id: Number(info.lastInsertRowid),
          },
        };
      },
    };
  }

  const db = {
    prepare: (sql) => prepared(sql),
    async batch(statements) {
      sqlite.exec("BEGIN");
      try {
        const out = [];
        for (const statement of statements) {
          // Reads and writes alike; D1 returns results for both.
          const stmt = sqlite.prepare(statement.sql);
          const values = statement.params.map(bindable);
          if (stmt.columns().length) {
            out.push({
              results: stmt.all(...values).map(plain),
              success: true,
              meta: {},
            });
          } else {
            const info = stmt.run(...values);
            out.push({
              results: [],
              success: true,
              meta: {
                changes: Number(info.changes),
                last_row_id: Number(info.lastInsertRowid),
              },
            });
          }
        }
        sqlite.exec("COMMIT");
        return out;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
    /** Raw SQL, for test setup. */
    exec: (sql) => sqlite.exec(sql),
    close: () => sqlite.close(),
  };
  return db;
}
