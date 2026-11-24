import { jsonResponse, readJsonBody, withApiHandler } from "../../../src/platform/http.js";
import { sessionEmail } from "../../../src/email/server/email-admin.js";
import { emailFrame } from "../../../src/email/server/email-frame.js";
import { createOneOffEmail } from "../../../src/email/server/one-off-email.js";
import { promoteChoices, promoteDraft } from "../../../src/email/server/promote.js";

/** What can be promoted (#348): each template and the things it can promote now. */
export const onRequestGet = withApiHandler(async (context) => {
  return jsonResponse(await promoteChoices(context.env));
});

/** Promote one: `{ template, id }`, or just `{ id }` of a series (its kind picks the template) → a draft built from its template, saved, to open in the editor. */
export const onRequestPost = withApiHandler(async (context) => {
  const body = await readJsonBody(context.request);
  if (!body || typeof body !== "object") return jsonResponse({ error: "Invalid request." }, 400);
  const draft = await promoteDraft(context.env, body, { site: emailFrame(context.env).site });
  const email = await createOneOffEmail(context.env, draft, { by: await sessionEmail(context) });
  return jsonResponse({ ok: true, email });
});
