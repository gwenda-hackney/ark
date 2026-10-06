/**
 * UserRepository in memory (#186): for tests, and the reference for what
 * every adapter must do (user-repository.contract.test.js).
 */
import { notFound, userRecord } from "../user-model.js";

export function memoryUserRepository(seed = []) {
  let users = new Map();
  let nextId = 1;
  const put = (record) => {
    users.set(record.id, record);
    nextId = Math.max(nextId, record.id + 1);
    return { ...record };
  };
  for (const user of seed) put(userRecord(user));

  const list = async () =>
    [...users.values()].sort((a, b) => a.id - b.id).map((u) => ({ ...u }));

  return {
    list,
    async get(id) {
      const user = users.get(Number(id));
      return user ? { ...user } : null;
    },
    async create(fields) {
      return put(userRecord({ ...fields, id: nextId }));
    },
    async update(id, fields) {
      const current = users.get(Number(id));
      if (!current) throw notFound();
      const given = Object.fromEntries(
        Object.entries(fields).filter(([, value]) => value !== undefined),
      );
      return put(userRecord({ ...current, ...given, id: current.id }));
    },
    async remove(id) {
      users.delete(Number(id));
    },
    async exportAll() {
      return { users: await list() };
    },
    async importAll(snapshot) {
      users = new Map();
      nextId = 1;
      for (const user of snapshot.users || []) put(userRecord(user));
    },
  };
}
