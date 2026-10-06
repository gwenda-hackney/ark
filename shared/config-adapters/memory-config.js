/**
 * ConfigRepository in memory: for tests, and the reference for what every
 * adapter must do (config-repository.contract.test.js).
 */
import { CONFIG_COLLECTION, configRecord, sameSlot } from "../config-model.js";

export function memoryConfigRepository(initial = []) {
  let records = initial.map((record, i) =>
    configRecord({ ...record, id: record.id ?? i + 1 }),
  );
  let nextId = Math.max(0, ...records.map((record) => record.id)) + 1;
  const copy = (record) => (record ? { ...record } : null);
  const remove = (matches) => {
    const before = records.length;
    records = records.filter((record) => !matches(record));
    return before - records.length;
  };

  return {
    async list() {
      return records.map(copy);
    },
    async find(fields) {
      const wanted = configRecord(fields);
      return copy(records.find((record) => sameSlot(record, wanted)));
    },
    async set(fields) {
      const wanted = configRecord(fields);
      const existing = records.find((record) => sameSlot(record, wanted));
      if (existing) {
        existing.value = wanted.value;
        return copy(existing);
      }
      const record = { ...wanted, id: nextId++ };
      records.push(record);
      return copy(record);
    },
    async removeNamed(name) {
      return remove((record) => record.name === String(name).trim());
    },
    async removeEnv(envName) {
      return remove((record) => record.env === envName);
    },
    async exportAll() {
      return {
        [CONFIG_COLLECTION]: [...records].sort((a, b) => a.id - b.id).map(copy),
      };
    },
    async importAll(snapshot) {
      records = (snapshot[CONFIG_COLLECTION] || []).map((record) =>
        configRecord(record),
      );
      nextId = Math.max(0, ...records.map((record) => record.id)) + 1;
    },
  };
}
