/**
 * SubscriberRepository on D1 (website database, db/website/migrations).
 * Email is unique without regard to case, so an address has one record.
 */
import { all, first } from "../../d1.js";
import { d1Table, exportTables, importTables } from "../../d1-table.js";
import { duplicateSubscriberError, normalizeTags } from "../subscribers.js";

export const subscribersTable = d1Table({
  table: "subscribers",
  columns: {
    id: "int",
    email: "text",
    tags: "json",
    signedUpOn: "date",
    synced: "bool",
  },
  orderBy: "id",
});

const SELECT = `SELECT ${subscribersTable.columns.map((c) => c.column).join(", ")} FROM subscribers`;

const tidy = (record) =>
  record && { ...record, tags: normalizeTags(record.tags) };

const writable = (fields) =>
  "tags" in fields ? { ...fields, tags: normalizeTags(fields.tags) } : fields;

/** @param {object} db  a D1 binding, or anything shaped like one */
export function d1SubscriberRepository(db) {
  return {
    async listByEmail(email) {
      return (
        await subscribersTable.list(db, {
          where: "email = ?",
          params: [String(email)],
        })
      ).map(tidy);
    },
    async listUnsynced({ limit = 100, all: every = false } = {}) {
      const rows = await all(
        db,
        `${SELECT}${every ? "" : " WHERE synced = 0"} ORDER BY id LIMIT ?`,
        [Number(limit)],
      );
      return rows.map((row) => tidy(subscribersTable.toRecord(row)));
    },
    async create(fields) {
      try {
        return tidy(
          await subscribersTable.insert(db, {
            tags: [],
            synced: false,
            ...writable(fields),
          }),
        );
      } catch (error) {
        if (/UNIQUE constraint failed/i.test(String(error?.message)))
          throw duplicateSubscriberError(error);
        throw error;
      }
    },
    async update(id, fields) {
      const { id: _id, ...rest } = writable(fields);
      return tidy(await subscribersTable.patch(db, id, rest));
    },
    async remove(id) {
      await subscribersTable.remove(db, id);
    },
    async count() {
      return Number(
        (await first(db, "SELECT COUNT(*) AS n FROM subscribers"))?.n ?? 0,
      );
    },
    async exportAll() {
      const { subscribers } = await exportTables(db, [subscribersTable]);
      return { subscribers: subscribers.map(tidy) };
    },
    async importAll({ subscribers = [] }) {
      await importTables(db, [
        [subscribersTable, subscribers.map((r) => writable(r))],
      ]);
    },
  };
}
