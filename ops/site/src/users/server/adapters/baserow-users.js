/**
 * UserRepository on Baserow (#186): the "Users" table of the ops database
 * (Name, Email, Active). The only users code that knows its columns.
 */
import {
  createRow,
  deleteRow,
  getRow,
  listAllRows,
  resolveOpsTableIds,
  updateRow,
} from "../../../../../../shared/baserow.js";
import { notFound, userRecord } from "../user-model.js";

function requireUsersTable(tables) {
  if (!tables.users) {
    const error = new Error(
      'Baserow table "Users" not found. Run npm run setup:baserow-ops.',
    );
    error.status = 503;
    throw error;
  }
  return tables.users;
}

/** A Users row → a record. A row whose Active was never set counts as active. */
export function userFromRow(row) {
  return userRecord({
    id: row.id,
    name: row.Name,
    email: row.Email,
    active: row.Active,
  });
}

function rowFromFields(fields) {
  const row = {};
  if (fields.name !== undefined) row.Name = fields.name;
  if (fields.email !== undefined) row.Email = fields.email;
  if (fields.active !== undefined) row.Active = Boolean(fields.active);
  return row;
}

export function baserowUserRepository(env) {
  const tableId = async () => requireUsersTable(await resolveOpsTableIds(env));

  async function list() {
    const rows = await listAllRows(env, await tableId());
    return rows.map(userFromRow).sort((a, b) => a.id - b.id);
  }

  return {
    list,
    async get(id) {
      const table = await tableId();
      try {
        return userFromRow(await getRow(env, table, id));
      } catch (error) {
        if (error?.status === 404) return null;
        throw error;
      }
    },
    async create(fields) {
      const row = await createRow(env, await tableId(), rowFromFields(fields));
      return userFromRow(row);
    },
    async update(id, fields) {
      const table = await tableId();
      try {
        return userFromRow(
          await updateRow(env, table, id, rowFromFields(fields)),
        );
      } catch (error) {
        if (error?.status === 404) throw notFound();
        throw error;
      }
    },
    async remove(id) {
      const table = await tableId();
      try {
        await deleteRow(env, table, id);
      } catch (error) {
        if (error?.status !== 404) throw error;
      }
    },
    async exportAll() {
      return { users: await list() };
    },
  };
}
