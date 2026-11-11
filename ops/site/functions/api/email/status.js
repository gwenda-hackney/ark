import { isOpsAdmin } from "../../../src/access/server/admin.js";
import { resolveAuth, resolveSessionEmail } from "../../../src/access/server/auth.js";
import { jsonResponse, withApiHandler } from "../../../src/platform/http.js";
import { emailAccess } from "../../../src/email/server/weekly-email.js";

/** What the Weekly email page can do here, and for whom. Anyone signed in. */
export const onRequestGet = withApiHandler(async (context) => {
  const email = await resolveSessionEmail(context.request, resolveAuth(context.env)).catch(() => "");
  return jsonResponse({
    ok: true,
    access: emailAccess(context.env),
    me: { email: email || "", isAdmin: await isOpsAdmin(context.env, email).catch(() => false) },
  });
});
