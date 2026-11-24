/**
 * The ops user record (#186): who may sign in to ops.
 *
 *   UserRecord = { id: number, name: string, email: string, active: boolean,
 *                  roleId: number | null }
 *
 * roleId: their role (role-model.js, #375); null counts as the default role.
 *
 * Emails are kept trimmed and lower case, so comparing them is comparing
 * strings: "Person@Gwenda.co.uk" signs in as person@gwenda.co.uk.
 */
import { AREA_IDS, LEVELS } from "../../access/areas.js";

export function normalizeEmail(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

export function text(value) {
  if (typeof value !== "string") return "";
  return value.trim();
}

/** A record from any fields, filling what's missing. */
export function userRecord({ id, name, email, active, roleId } = {}) {
  return {
    id: Number(id),
    name: text(name),
    email: normalizeEmail(email),
    active: active == null ? true : Boolean(active),
    roleId: roleId == null || roleId === "" ? null : Number(roleId),
  };
}

/**
 * Levels by area, cleaned: known areas and levels only. Without keepNone,
 * "none" is left out (an extra of none gives nothing).
 */
export function areaLevels(value, { keepNone = true } = {}) {
  let raw = value;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      raw = {};
    }
  }
  if (!raw || typeof raw !== "object") return {};
  return Object.fromEntries(
    AREA_IDS.filter((area) => LEVELS.includes(raw[area]) && (keepNone || raw[area] !== "none")).map((area) => [area, raw[area]]),
  );
}

export function notFound() {
  const error = new Error("User not found.");
  error.status = 404;
  return error;
}
