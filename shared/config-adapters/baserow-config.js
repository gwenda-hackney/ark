/**
 * ConfigRepository on Baserow (Gwenda Config / Config), over config-db.js.
 * Only this adapter knows the Name / Value / Env / Service columns.
 *
 * A set finds, then creates, so two writers at once could both create a
 * row: Baserow may hold duplicates for one name + env + service. Only the
 * first (lowest id) is ever read or updated; the data move leaves the rest
 * out (scripts/lib/data-move/features.mjs).
 */
import {
  deleteConfigEnvRows,
  deleteConfigRows,
  findConfigRow,
  listConfigRows,
  rowRecord,
  setConfigValueFor,
} from "../config-db.js";
import { CONFIG_COLLECTION, configRecord } from "../config-model.js";

export function baserowConfigRepository(env) {
  return {
    async list() {
      return (await listConfigRows(env)).map(rowRecord);
    },
    async find(fields) {
      const { name, env: envName, service } = configRecord(fields);
      const row = await findConfigRow(env, service, name, envName);
      return row ? rowRecord(row) : null;
    },
    async set(fields) {
      const { name, env: envName, service, value } = configRecord(fields);
      return rowRecord(
        await setConfigValueFor(env, service, name, envName, value),
      );
    },
    async removeNamed(name) {
      return deleteConfigRows(env, String(name).trim());
    },
    async removeEnv(envName) {
      return deleteConfigEnvRows(env, envName);
    },
    async exportAll() {
      const rows = await listConfigRows(env, { fresh: true });
      return {
        [CONFIG_COLLECTION]: rows.map(rowRecord).sort((a, b) => a.id - b.id),
      };
    },
  };
}
