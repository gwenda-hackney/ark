/**
 * The ops role record (#375): a named set of levels by area.
 *
 *   RoleRecord = { id: number, name: string, owner: boolean, isDefault: boolean,
 *                  areas: { [area]: "none" | "view" | "edit" } }
 *
 * owner: everything, whatever `areas` says (the Owner role). isDefault: the
 * role of anyone who hasn't been given one (Manager).
 */
import { text } from "./user-model.js";
import { areaLevels } from "./user-model.js";

export function roleRecord({ id, name, owner, isDefault, areas } = {}) {
  return {
    id: Number(id),
    name: text(name),
    owner: Boolean(owner),
    isDefault: Boolean(isDefault),
    areas: areaLevels(areas),
  };
}

export function roleNotFound() {
  const error = new Error("Role not found.");
  error.status = 404;
  return error;
}
