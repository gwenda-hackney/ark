import { requireArea } from "../../access/server/access.js";
import { resolveAuth, resolveSessionEmail } from "../../access/server/auth.js";

/** The signed-in person's address, from their session; "" with none. */
export function sessionEmail(context) {
  return resolveSessionEmail(context.request, resolveAuth(context.env)).catch(() => "");
}

/**
 * Changing the monthly email's schedule and sending to the list need Edit on
 * Email: send and schedule (#375). Throws 403 for anyone else.
 */
export async function requireEmailAdmin(context) {
  try {
    await requireArea(context.env, await sessionEmail(context), "email-send", "edit");
  } catch (error) {
    if (error.status === 403) error.message = "You can't change the schedule or send to the mailing list. Ask an owner.";
    throw error;
  }
}
