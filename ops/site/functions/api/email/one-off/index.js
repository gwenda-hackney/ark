import { jsonResponse, readJsonBody, withApiHandler } from "../../../../src/platform/http.js";
import { sessionEmail } from "../../../../src/email/server/email-admin.js";
import { createOneOffEmail, listOneOffEmails, oneOffEmailContext } from "../../../../src/email/server/one-off-email.js";

/** The Write tab's list (#348), and the frame a new email's preview is drawn in. Anyone signed in. */
export const onRequestGet = withApiHandler(async (context) => {
  return jsonResponse({ ...(await listOneOffEmails(context.env)), ...oneOffEmailContext(context.env) });
});

/** New email: saved as a draft. */
export const onRequestPost = withApiHandler(async (context) => {
  const body = await readJsonBody(context.request);
  if (!body || typeof body !== "object") return jsonResponse({ error: "Invalid request." }, 400);
  const email = await createOneOffEmail(context.env, body, { by: await sessionEmail(context) });
  return jsonResponse({ ok: true, email });
});
