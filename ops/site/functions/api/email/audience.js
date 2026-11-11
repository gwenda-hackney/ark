import { jsonResponse, withApiHandler } from "../../../src/platform/http.js";
import { audienceSize } from "../../../src/email/server/weekly-email.js";
import { requireEmailAdmin } from "../../../src/email/server/email-admin.js";

/** How many people are on the mailing list, for the "send to N people?" confirmation. Admins only. */
export const onRequestGet = withApiHandler(async (context) => {
  await requireEmailAdmin(context);
  return jsonResponse({ ok: true, audience: await audienceSize(context.env) });
});
