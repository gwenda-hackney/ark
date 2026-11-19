import { requestIsAdmin } from "../../access/server/admin.js";
import { resolveAuth, resolveSessionEmail } from "../../access/server/auth.js";

/** The signed-in person's address, from their session; "" with none. */
export function sessionEmail(context) {
  return resolveSessionEmail(context.request, resolveAuth(context.env)).catch(() => "");
}

/** Changing the monthly email's settings and sending to the list are for admins. Throws 403 for anyone else. */
export async function requireEmailAdmin(context) {
  if (await requestIsAdmin(context.env, context.request)) return;
  const error = new Error("Only admins can change the schedule or send to the mailing list.");
  error.status = 403;
  throw error;
}
