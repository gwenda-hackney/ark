import { jsonResponse, readJsonBody, withApiHandler } from "../../../src/platform/http.js";
import { approveAndSend, weeklyEmailStatus } from "../../../src/email/server/weekly-email.js";
import { requireEmailAdmin, sessionEmail } from "../../../src/email/server/email-admin.js";

/**
 * "Approve and send": `{ confirm: "send" }` sends this week's waiting draft
 * to the mailing list. Admins, on production, with the email switched on.
 */
export const onRequestPost = withApiHandler(async (context) => {
  await requireEmailAdmin(context);
  const body = await readJsonBody(context.request);
  if (body?.confirm !== "send") {
    return jsonResponse({ error: 'Send confirm: "send" to send to the mailing list.' }, 400);
  }
  await approveAndSend(context.env, { email: await sessionEmail(context) });
  return jsonResponse({ ok: true, ...(await weeklyEmailStatus(context.env)) });
});
