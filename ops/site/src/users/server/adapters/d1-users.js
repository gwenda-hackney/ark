/**
 * UserRepository on D1 (#127): the `users` table of the ops database
 * (db/ops/migrations/0003_users.sql). The only users code that knows it.
 */
import {
  d1Table,
  exportTables,
  importTables,
} from "../../../../../../shared/d1-table.js";
import { notFound, userRecord } from "../user-model.js";

export const usersTable = d1Table({
  table: "users",
  columns: { id: "int", name: "text", email: "text", active: "bool" },
  orderBy: "id",
});

/** Only the fields given, cleaned the way every adapter keeps them. */
function cleanFields(fields) {
  const full = userRecord(fields);
  return Object.fromEntries(
    Object.keys(full)
      .filter((key) => key !== "id" && fields[key] !== undefined)
      .map((key) => [key, full[key]]),
  );
}

export function d1UserRepository(db) {
  const list = () => usersTable.list(db);
  return {
    list,
    get: (id) => usersTable.get(db, id),
    create(fields) {
      const { id: _new, ...row } = userRecord(fields);
      return usersTable.insert(db, row);
    },
    async update(id, fields) {
      const user = await usersTable.patch(db, id, cleanFields(fields));
      if (!user) throw notFound();
      return user;
    },
    remove: (id) => usersTable.remove(db, id),
    async exportAll() {
      return exportTables(db, [usersTable]);
    },
    async importAll(snapshot) {
      await importTables(db, [
        [usersTable, (snapshot.users || []).map(userRecord)],
      ]);
    },
  };
}
