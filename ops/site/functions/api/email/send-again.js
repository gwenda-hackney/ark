import { jsonResponse, readJsonBody, withApiHandler } from "../../../src/platform/http.js";
import { sendAgain, weeklyEmailStatus } from "../../../src/email/server/weekly-email.js";
import { requireEmailAdmin, sessionEmail } from "../../../src/email/server/email-admin.js";

/**
 * "Send again": `{ confirm: "send-again", after: <id of the sent one> }`
 * sends this week's email a second time. Admins, on production.
 */
export const onRequestPost = withApiHandler(async (context) => {
  await requireEmailAdmin(context);
  const body = await readJsonBody(context.request);
  if (body?.confirm !== "send-again") {
    return jsonResponse({ error: 'Send confirm: "send-again" to send this week\'s email a second time.' }, 400);
  }
  await sendAgain(context.env, { after: body.after, email: await sessionEmail(context) });
  return jsonResponse({ ok: true, ...(await weeklyEmailStatus(context.env)) });
});
