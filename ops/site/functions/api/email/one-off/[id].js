import { jsonResponse, readJsonBody, withApiHandler } from "../../../../src/platform/http.js";
import { sessionEmail } from "../../../../src/email/server/email-admin.js";
import { deleteOneOffEmail, getOneOffEmail, saveOneOffEmail } from "../../../../src/email/server/one-off-email.js";

function emailId(context) {
  const id = Number(context.params?.id);
  return Number.isInteger(id) && id > 0 ? id : 0;
}

/** One email (#348), with the frame its preview is drawn in. */
export const onRequestGet = withApiHandler(async (context) => {
  const id = emailId(context);
  if (!id) return jsonResponse({ error: "Missing email id." }, 400);
  return jsonResponse(await getOneOffEmail(context.env, id));
});

/** Save a draft: its subject, preview line and sections. */
export const onRequestPatch = withApiHandler(async (context) => {
  const id = emailId(context);
  if (!id) return jsonResponse({ error: "Missing email id." }, 400);
  const body = await readJsonBody(context.request);
  if (!body || typeof body !== "object") return jsonResponse({ error: "Invalid request." }, 400);
  const email = await saveOneOffEmail(context.env, id, body, { by: await sessionEmail(context) });
  return jsonResponse({ ok: true, email });
});

/** Delete a draft. */
export const onRequestDelete = withApiHandler(async (context) => {
  const id = emailId(context);
  if (!id) return jsonResponse({ error: "Missing email id." }, 400);
  return jsonResponse({ ok: true, ...(await deleteOneOffEmail(context.env, id)) });
});
