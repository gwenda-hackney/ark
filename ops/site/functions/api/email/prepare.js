import { jsonResponse, withApiHandler } from "../../../src/platform/http.js";
import { prepareNow, weeklyEmailStatus } from "../../../src/email/server/weekly-email.js";
import { requireEmailAdmin } from "../../../src/email/server/email-admin.js";

/**
 * "Try again": build this week's email and leave it waiting for Approve and
 * send. Sends nothing. Admins, on production, with the email switched on.
 */
export const onRequestPost = withApiHandler(async (context) => {
  await requireEmailAdmin(context);
  await prepareNow(context.env);
  return jsonResponse({ ok: true, ...(await weeklyEmailStatus(context.env)) });
});
