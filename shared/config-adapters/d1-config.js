/**
 * ConfigRepository on D1 (#127): the config database's config_values table
 * (db/config/migrations/0002_config.sql). A set is one upsert on the
 * name + env + service key, so two writers at once update one row.
 *
 * list() is cached for CONFIG_CACHE_TTL_MS like the Baserow adapter's, per
 * `cacheKey` (the database, unless the caller names it).
 */
import { exportTables, d1Table, importTables } from "../d1-table.js";
import { run } from "../d1.js";
import {
  CONFIG_CACHE_TTL_MS,
  CONFIG_COLLECTION,
  configRecord,
} from "../config-model.js";

const values = d1Table({
  table: CONFIG_COLLECTION,
  columns: {
    id: "int",
    name: "text",
    value: "text",
    env: "text",
    service: "text",
  },
  orderBy: "id",
});

const SLOT = ["name", "env", "service"];

const cache = new Map();

export function resetD1ConfigCacheForTests() {
  cache.clear();
}

/** Like Baserow's: "can't read config" is a 503, so callers with a default use it. */
function unavailable(error) {
  const wrapped = new Error(`Config D1: ${error?.message || error}`);
  wrapped.status = 503;
  return wrapped;
}

export function d1ConfigRepository(db, { cacheKey = db } = {}) {
  const changed = () => cache.delete(cacheKey);
  const remove = async (where, param) => {
    const meta = await run(db, `DELETE FROM ${values.table} WHERE ${where}`, [
      param,
    ]);
    changed();
    return Number(meta.changes ?? 0);
  };

  return {
    async list() {
      const hit = cache.get(cacheKey);
      if (hit && Date.now() - hit.at < CONFIG_CACHE_TTL_MS) return hit.records;
      let records;
      try {
        records = await values.list(db);
      } catch (error) {
        throw unavailable(error);
      }
      cache.set(cacheKey, { at: Date.now(), records });
      return records;
    },
    async find(fields) {
      const { name, env, service } = configRecord(fields);
      const [record] = await values.list(db, {
        where: "name = ? AND env = ? AND service = ?",
        params: [name, env, service],
      });
      return record ?? null;
    },
    async set(fields) {
      const { id: _id, ...record } = configRecord(fields);
      const saved = await values.upsert(db, record, SLOT);
      changed();
      return saved;
    },
    async removeNamed(name) {
      return remove("name = ?", String(name).trim());
    },
    async removeEnv(envName) {
      return remove("env = ?", envName);
    },
    async exportAll() {
      return exportTables(db, [values]);
    },
    async importAll(snapshot) {
      await importTables(db, [
        [values, (snapshot[CONFIG_COLLECTION] || []).map(configRecord)],
      ]);
      changed();
    },
  };
}
