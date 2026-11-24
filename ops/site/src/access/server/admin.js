/**
 * Owners (#375; "admins" before roles): everything in ops, developer tools
 * included. Who is one comes from their role (access.js); on dev and a
 * developer's machine everyone is.
 */
import { resolveAuth, resolveSessionEmail } from "./auth.js";
import { accessFor, requireArea } from "./access.js";

export { ADMIN_EMAILS_KEY, parseAdminEmails } from "./access.js";

export async function isOpsAdmin(env, email) {
  return (await accessFor(env, email)).owner;
}

export async function requestEmail(env, request) {
  return resolveSessionEmail(request, resolveAuth(env)).catch(() => "");
}

export async function requestIsAdmin(env, request) {
  return isOpsAdmin(env, await requestEmail(env, request));
}

/** Throws 403 unless they can use developer tools. */
export async function requireAdmin(env, request) {
  await requireArea(env, await requestEmail(env, request), "devtools", "edit");
}
