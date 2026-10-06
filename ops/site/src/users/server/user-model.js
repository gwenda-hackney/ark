/**
 * The ops user record (#186): who may sign in to ops.
 *
 *   UserRecord = { id: number, name: string, email: string, active: boolean }
 *
 * Emails are kept trimmed and lower case, so comparing them is comparing
 * strings: "Person@Gwenda.co.uk" signs in as person@gwenda.co.uk.
 */

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
export function userRecord({ id, name, email, active } = {}) {
  return {
    id: Number(id),
    name: text(name),
    email: normalizeEmail(email),
    active: active == null ? true : Boolean(active),
  };
}

export function notFound() {
  const error = new Error("User not found.");
  error.status = 404;
  return error;
}
