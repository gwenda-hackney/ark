import { resolveAuth, resolveSessionEmail } from "../../../src/access/server/auth.js";
import { jsonResponse, withApiHandler } from "../../../src/platform/http.js";
import { sendTestToSelf } from "../../../src/email/server/weekly-email.js";

/**
 * "Send me a test": this week's email to the signed-in person's own address.
 * The address comes from their session; nothing in the request can change it.
 */
export const onRequestPost = withApiHandler(async (context) => {
  const email = await resolveSessionEmail(context.request, resolveAuth(context.env)).catch(() => "");
  return jsonResponse({ ok: true, ...(await sendTestToSelf(context.env, { email })) });
});
