/**
 * RoleRepository in memory (#375): for tests, and the reference for what
 * every adapter must do (role-repository.contract.test.js). Starts with the
 * two roles the migration makes, Owner and Manager.
 */
import { roleNotFound, roleRecord } from "../role-model.js";
import { DEFAULT_ROLES } from "../role-repository.js";

export function memoryRoleRepository(seed = DEFAULT_ROLES) {
  let roles = new Map();
  let nextId = 1;
  const put = (role) => {
    roles.set(role.id, role);
    nextId = Math.max(nextId, role.id + 1);
    return structuredClone(role);
  };
  for (const role of seed) put(roleRecord(role));
  const list = async () => [...roles.values()].sort((a, b) => a.id - b.id).map((role) => structuredClone(role));
  return {
    list,
    async get(id) {
      const role = roles.get(Number(id));
      return role ? structuredClone(role) : null;
    },
    async create(fields) {
      return put(roleRecord({ ...fields, id: nextId }));
    },
    async update(id, fields) {
      const current = roles.get(Number(id));
      if (!current) throw roleNotFound();
      return put(roleRecord({ ...current, ...fields, id: current.id }));
    },
    async remove(id) {
      roles.delete(Number(id));
    },
    async exportAll() {
      return { roles: await list() };
    },
    async importAll(snapshot) {
      roles = new Map();
      nextId = 1;
      for (const role of snapshot.roles || []) put(roleRecord(role));
    },
  };
}
