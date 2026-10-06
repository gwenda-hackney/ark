/**
 * SubscriberRepository in memory: for tests, and the reference for what
 * every adapter must do (subscriber-repository.contract.test.js).
 */
import { duplicateSubscriberError, normalizeTags } from "../subscribers.js";

const EMPTY = { email: "", tags: [], signedUpOn: null, synced: false };

const copy = (value) => structuredClone(value);
const sameEmail = (a, b) => a.toLowerCase() === String(b).toLowerCase();

export function memorySubscriberRepository() {
  const records = new Map();
  let nextId = 1;

  const tidy = (fields) => {
    const out = {};
    if ("email" in fields) out.email = String(fields.email ?? "");
    if ("tags" in fields) out.tags = normalizeTags(fields.tags);
    if ("signedUpOn" in fields) out.signedUpOn = fields.signedUpOn || null;
    if ("synced" in fields) out.synced = Boolean(fields.synced);
    return out;
  };
  const sorted = () => [...records.values()].sort((a, b) => a.id - b.id);

  return {
    async listByEmail(email) {
      return sorted()
        .filter((record) => sameEmail(record.email, email))
        .map(copy);
    },
    async listUnsynced({ limit = 100, all = false } = {}) {
      return sorted()
        .filter((record) => all || !record.synced)
        .slice(0, limit)
        .map(copy);
    },
    async create(fields) {
      const record = { ...EMPTY, ...tidy(fields), id: nextId++ };
      if (sorted().some((other) => sameEmail(other.email, record.email)))
        throw duplicateSubscriberError();
      records.set(record.id, record);
      return copy(record);
    },
    async update(id, fields) {
      const record = records.get(Number(id));
      if (!record) return null;
      const { id: _id, ...rest } = tidy(fields);
      Object.assign(record, rest);
      return copy(record);
    },
    async remove(id) {
      records.delete(Number(id));
    },
    async count() {
      return records.size;
    },
    async exportAll() {
      return { subscribers: sorted().map(copy) };
    },
    async importAll({ subscribers = [] }) {
      records.clear();
      for (const record of subscribers) {
        records.set(Number(record.id), {
          ...EMPTY,
          ...tidy(record),
          id: Number(record.id),
        });
        nextId = Math.max(nextId, Number(record.id) + 1);
      }
    },
  };
}
