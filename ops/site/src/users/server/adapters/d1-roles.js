/**
 * RoleRepository on D1 (#375): the `roles` table of the ops database
 * (db/ops/migrations/0021_roles.sql). The only code that knows it.
 */
import { d1Table, exportTables, importTables } from "../../../../../../shared/d1-table.js";
import { roleNotFound, roleRecord } from "../role-model.js";

export const rolesTable = d1Table({
  table: "roles",
  columns: { id: "int", name: "text", owner: "bool", isDefault: "bool", areas: "json" },
  orderBy: "id",
});

export function d1RoleRepository(db) {
  const record = (row) => (row ? roleRecord(row) : null);
  const list = async () => (await rolesTable.list(db)).map(record);
  return {
    list,
    get: async (id) => record(await rolesTable.get(db, id)),
    async create(fields) {
      const { id: _new, ...row } = roleRecord(fields);
      return record(await rolesTable.insert(db, row));
    },
    async update(id, fields) {
      const current = await rolesTable.get(db, id);
      if (!current) throw roleNotFound();
      const { id: _id, ...row } = roleRecord({ ...roleRecord(current), ...fields });
      return record(await rolesTable.patch(db, id, row));
    },
    remove: (id) => rolesTable.remove(db, id),
    async exportAll() {
      return exportTables(db, [rolesTable]);
    },
    async importAll(snapshot) {
      await importTables(db, [[rolesTable, (snapshot.roles || []).map(roleRecord)]]);
    },
  };
}
