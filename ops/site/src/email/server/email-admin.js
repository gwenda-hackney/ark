import { requestIsAdmin } from "../../access/server/admin.js";
import { resolveAuth, resolveSessionEmail } from "../../access/server/auth.js";

/** The signed-in person's address, from their session; "" with none. */
export function sessionEmail(context) {
  return resolveSessionEmail(context.request, resolveAuth(context.env)).catch(() => "");
}

/** Changing the weekly email's settings and sending it are for admins. Throws 403 for anyone else. */
export async function requireEmailAdmin(context) {
  if (await requestIsAdmin(context.env, context.request)) return;
  const error = new Error("Only admins can change or send the weekly email.");
  error.status = 403;
  throw error;
}
