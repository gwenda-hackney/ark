import { jsonResponse, readJsonBody, withApiHandler } from "../../../../../src/platform/http.js";
import { requireEmailAdmin, sessionEmail } from "../../../../../src/email/server/email-admin.js";
import { sendOneOffToList } from "../../../../../src/email/server/one-off-email.js";

/**
 * "Send to the list" (#348): `{ confirm: "send" }` sends the saved email to
 * everyone on the mailing list, now. Admins, on production ops only.
 */
export const onRequestPost = withApiHandler(async (context) => {
  const id = Number(context.params?.id);
  if (!Number.isInteger(id) || id < 1) return jsonResponse({ error: "Missing email id." }, 400);
  await requireEmailAdmin(context);
  const body = await readJsonBody(context.request);
  if (body?.confirm !== "send") {
    return jsonResponse({ error: 'Send confirm: "send" to send to the mailing list.' }, 400);
  }
  const email = await sendOneOffToList(context.env, id, { email: await sessionEmail(context) });
  return jsonResponse({ ok: true, email });
});
