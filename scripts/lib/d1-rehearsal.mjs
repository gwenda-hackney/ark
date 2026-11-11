/**
 * Rehearse a data migration against a copy of a D1 database.
 *
 * A dry run that only describes what it would do drifts from what the real
 * run does. Here a dry run does the real thing, through the same use cases
 * and repositories, against a throwaway copy: an in-memory SQLite with every
 * db/<role>/migrations/*.sql applied (shared/testing/d1-sqlite.js), filled
 * with the real rows of the tables the migration touches. Nothing is written
 * to the real database, and what the run logs is what the real run will do.
 *
 * The copy has the newest schema, so a rehearsal also works before a new
 * SQL migration reached the real database: `missing` then names what the
 * real one lacks, and the real run refuses until it is applied (assertSchema).
 */
import { identifier } from "../../shared/d1.js";
import { createTestD1 } from "../../shared/testing/d1-sqlite.js";

async function columnsOf(db, table) {
  const { results = [] } = await db.prepare(`PRAGMA table_info(${identifier(table)})`).all();
  return results.map((row) => String(row.name));
}

/**
 * What the real database lacks of what the code expects (the schema in
 * db/<role>/migrations): `[{ table, columns }]`, `columns: null` when the
 * whole table is missing. Empty when it is up to date.
 */
export async function missingSchema(db, role, tables) {
  const expected = createTestD1(role);
  try {
    const missing = [];
    for (const table of tables) {
      const want = await columnsOf(expected, table);
      const have = await columnsOf(db, table);
      if (!have.length) missing.push({ table, columns: null });
      else {
        const columns = want.filter((column) => !have.includes(column));
        if (columns.length) missing.push({ table, columns });
      }
    }
    return missing;
  } finally {
    expected.close();
  }
}

export function describeMissing(missing) {
  return missing
    .map(({ table, columns }) => (columns ? columns.map((column) => `${table}.${column}`).join(", ") : `table ${table}`))
    .join(", ");
}

/** The command that applies the D1 schema (db/<role>/migrations/*.sql) to an environment. */
export function schemaCommand(env, role) {
  return env === "production"
    ? `node scripts/with-production-cloudflare.mjs node scripts/d1-migrate.mjs --env production --db ${role} (deploys run it first)`
    : `node scripts/with-ops-env.mjs node scripts/d1-migrate.mjs --env ${env} --db ${role}`;
}

/** Refuse to run for real against a database whose schema is behind the code. */
export async function assertSchema(db, { env, role, tables }) {
  const missing = await missingSchema(db, role, tables);
  if (!missing.length) return;
  throw new Error(
    `The ${env} ${role} database is missing ${describeMissing(missing)}. Apply the D1 schema first: ${schemaCommand(env, role)}`,
  );
}

/**
 * A copy of `tables` (parents first) of the real database `db`, with the
 * newest schema. Columns the real one lacks take their defaults.
 * @returns {Promise<{ db: ReturnType<typeof createTestD1>, missing: { table: string, columns: string[] | null }[] }>}
 */
export async function rehearsalCopy(db, role, tables) {
  const copy = createTestD1(role);
  const missing = [];
  copy.exec("PRAGMA foreign_keys = OFF;");
  for (const table of tables) {
    const want = await columnsOf(copy, table);
    const have = await columnsOf(db, table);
    if (!have.length) {
      missing.push({ table, columns: null });
      continue;
    }
    const lacking = want.filter((column) => !have.includes(column));
    if (lacking.length) missing.push({ table, columns: lacking });
    const shared = want.filter((column) => have.includes(column));
    const { results = [] } = await db.prepare(`SELECT ${shared.join(", ")} FROM ${identifier(table)}`).all();
    const insert = `INSERT INTO ${table} (${shared.join(", ")}) VALUES (${shared.map(() => "?").join(", ")})`;
    for (let i = 0; i < results.length; i += 200) {
      await copy.batch(
        results.slice(i, i + 200).map((row) => {
          const params = shared.map((column) => row[column] ?? null);
          return { sql: insert, params };
        }),
      );
    }
  }
  copy.exec("PRAGMA foreign_keys = ON;");
  return { db: copy, missing };
}

/**
 * The database a migration works on: the real one, or for a dry run a
 * rehearsal copy of `tables`. Logs which, and what the real one is missing.
 */
export async function databaseForMigration(real, { env, role, tables, dryRun, log }) {
  if (!dryRun) {
    await assertSchema(real, { env, role, tables });
    return real;
  }
  const { db, missing } = await rehearsalCopy(real, role, tables);
  log("Dry run: working on a copy of the data. Nothing is written.");
  if (missing.length) {
    log(`The ${env} ${role} database is missing ${describeMissing(missing)}; the copy has them.`);
    log(`Before the real run, apply the D1 schema: ${schemaCommand(env, role)}`);
  }
  return db;
}
