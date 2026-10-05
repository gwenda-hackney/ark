/**
 * Deep health for a D1 database (#127): reachable, migrated, and writable.
 * Every deploy proves the binding, the token and the schema this way, before
 * any feature keeps its data in D1.
 *
 * The write is a `smoke:<uuid>` row in `_meta`, deleted straight after. The
 * uuid keeps two deploys checking the same database at once (live and
 * preview share production's) from touching each other's row.
 */
import { all, first, run } from "./d1.js";

/** Wrangler records applied migrations here (its default migrations_table). */
export const MIGRATIONS_TABLE = "d1_migrations";

export const SMOKE_KEY_PREFIX = "smoke:";

/** Throws with the step that failed; returns a one-line summary. */
export async function checkD1(db, { uuid = () => crypto.randomUUID() } = {}) {
  if (!db) throw new Error("not bound.");

  let applied;
  try {
    applied = await all(db, `SELECT name FROM ${MIGRATIONS_TABLE} ORDER BY id`);
  } catch (error) {
    if (/no such table/i.test(String(error?.message)))
      throw new Error("no migrations applied (run d1-migrate).");
    throw error;
  }
  if (!applied.length)
    throw new Error("no migrations applied (run d1-migrate).");

  const key = SMOKE_KEY_PREFIX + uuid();
  const value = new Date().toISOString();
  await run(db, "INSERT INTO _meta (key, value) VALUES (?, ?)", [key, value]);
  try {
    const read = await first(db, "SELECT value FROM _meta WHERE key = ?", [
      key,
    ]);
    if (read?.value !== value)
      throw new Error("wrote a test row but read back something else.");
  } finally {
    await run(db, "DELETE FROM _meta WHERE key = ?", [key]);
  }

  const latest = applied[applied.length - 1].name;
  return `${applied.length} migration${applied.length === 1 ? "" : "s"} (latest ${latest}), write and delete ok`;
}
