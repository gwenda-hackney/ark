/**
 * Admins see developer tools (code, databases, resetting the preview site).
 * Everyone else sees the plain editor screens. The list is a setting in Gwenda
 * Config (ops.admin_emails, comma-separated) rather than a Users column, so
 * it needs no Baserow schema change. Local ops: everyone is an admin.
 */
import { resolveAuth, resolveSessionEmail } from "./auth.js";
import { getConfigString, siteEnvName } from "./config-store.js";

export const ADMIN_EMAILS_KEY = "ops.admin_emails";

export function parseAdminEmails(value) {
  return new Set(
    String(value || "")
      .split(/[\s,;]+/)
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

export async function isOpsAdmin(env, email, { read = getConfigString } = {}) {
  if (siteEnvName(env) === "dev") return true;
  const normalized = String(email || "").trim().toLowerCase();
  if (!normalized) return false;
  return parseAdminEmails(await read(env, ADMIN_EMAILS_KEY)).has(normalized);
}

export async function requestIsAdmin(env, request) {
  const email = await resolveSessionEmail(request, resolveAuth(env)).catch(() => "");
  return isOpsAdmin(env, email);
}

/** Throws 403 for non-admins. */
export async function requireAdmin(env, request) {
  if (await requestIsAdmin(env, request)) return;
  const error = new Error("Only admins can use developer tools.");
  error.status = 403;
  throw error;
}
