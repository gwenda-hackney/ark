/**
 * This environment's D1 databases, for Developer tools → Databases (#234):
 * the records each table holds, the migrations applied, and when each
 * feature was last copied in (data-move's `moved:<feature>` rows in _meta).
 * Four queries per database, whatever its size: D1's free plan allows 50 per
 * request.
 */
import { environmentOf } from "../../../../shared/config-model.js";
import { all, fromJson, identifier } from "../../../../shared/d1.js";
import { D1_DATABASES } from "../../../../shared/d1-databases.js";
import { databaseFor } from "../../../../shared/d1-env.js";
import { MIGRATIONS_TABLE } from "../../../../shared/d1-health.js";

/** The databases the page shows, in order. Config is settings: Developer tools → Settings. */
export const STATUS_DATABASES = { ops: "Ops", website: "Website" };

/** Bookkeeping tables, not records. */
const BOOKKEEPING = new Set(["_meta", MIGRATIONS_TABLE]);
const internal = (name) => BOOKKEEPING.has(name) || /^(sqlite_|_cf_)/.test(name);

const MOVED_PREFIX = "moved:";

/**
 * @param {Record<string, any>} env
 * @param {"ops" | "website"} role
 * @returns {Promise<{ id: string, label: string, name: string, environment: string,
 *   tables: { name: string, rows: number }[],
 *   migrations: { count: number, latest: string },
 *   moves: { feature: string, from: string, at: string, records: number }[],
 *   checkedAt: string }>}
 */
export async function databaseStatus(env, role, { now = () => new Date() } = {}) {
  const label = STATUS_DATABASES[role];
  if (!label) {
    const error = new Error(`Unknown database "${role}". Use ${Object.keys(STATUS_DATABASES).join(" or ")}.`);
    error.status = 400;
    throw error;
  }
  const environment = environmentOf(env);
  const db = databaseFor(env, role);

  const names = (await all(db, "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name"))
    .map((row) => row.name)
    .filter((name) => !internal(name));
  const counts = names.length
    ? await all(
        db,
        names.map((name) => `SELECT '${name.replaceAll("'", "''")}' AS name, COUNT(*) AS rows FROM ${identifier(name)}`).join(" UNION ALL "),
      )
    : [];
  const rowsOf = new Map(counts.map((row) => [row.name, Number(row.rows)]));

  const applied = await all(db, `SELECT name FROM ${MIGRATIONS_TABLE} ORDER BY id`).catch((error) => {
    if (/no such table/i.test(String(error?.message))) return [];
    throw error;
  });

  const moved = await all(db, "SELECT key, value, updated_at FROM _meta WHERE key LIKE ? ORDER BY key", [
    `${MOVED_PREFIX}%`,
  ]);

  return {
    id: role,
    label,
    name: D1_DATABASES[environment]?.[role]?.name || role,
    environment,
    tables: names.map((name) => ({ name, rows: rowsOf.get(name) ?? 0 })),
    migrations: { count: applied.length, latest: applied.at(-1)?.name || "" },
    moves: moved.map((row) => {
      const value = fromJson(row.value, {}) || {};
      const records = Object.values(value.counts || {}).reduce((sum, n) => sum + (Number(n) || 0), 0);
      return {
        feature: row.key.slice(MOVED_PREFIX.length),
        from: String(value.from || ""),
        at: String(value.at || row.updated_at || ""),
        records,
      };
    }),
    checkedAt: now().toISOString(),
  };
}
