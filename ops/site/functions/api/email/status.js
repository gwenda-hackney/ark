import { isOpsAdmin } from "../../../src/access/server/admin.js";
import { jsonResponse, withApiHandler } from "../../../src/platform/http.js";
import { weeklyEmailStatus } from "../../../src/email/server/weekly-email.js";
import { sessionEmail } from "../../../src/email/server/email-admin.js";

/** Settings, when the next one is due, this week's and the last few. Anyone signed in. */
export const onRequestGet = withApiHandler(async (context) => {
  const email = await sessionEmail(context);
  return jsonResponse({
    ok: true,
    ...(await weeklyEmailStatus(context.env)),
    me: { email: email || "", isAdmin: await isOpsAdmin(context.env, email).catch(() => false) },
  });
});
