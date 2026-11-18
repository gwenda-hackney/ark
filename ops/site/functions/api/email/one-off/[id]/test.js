import { jsonResponse, withApiHandler } from "../../../../../src/platform/http.js";
import { sessionEmail } from "../../../../../src/email/server/email-admin.js";
import { sendOneOffTest } from "../../../../../src/email/server/one-off-email.js";

/**
 * "Send me a test" (#348): the saved email to the signed-in person's own
 * address. The address comes from their session; nothing in the request can change it.
 */
export const onRequestPost = withApiHandler(async (context) => {
  const id = Number(context.params?.id);
  if (!Number.isInteger(id) || id < 1) return jsonResponse({ error: "Missing email id." }, 400);
  return jsonResponse({ ok: true, ...(await sendOneOffTest(context.env, id, { email: await sessionEmail(context) })) });
});
