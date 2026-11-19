import { resolveAuth, resolveSessionEmail } from "../../../src/access/server/auth.js";
import { jsonResponse, readJsonBody, withApiHandler } from "../../../src/platform/http.js";
import { listOccasions, saveOccasion } from "../../../src/occasions/server/occasions.js";
import { problemResponse } from "../../../src/occasions/server/problem-response.js";

/** Every occasion (#353), and where they stand on the website. */
export const onRequestGet = withApiHandler(async (context) => jsonResponse(await listOccasions(context.env)));

/** A new occasion; it goes on the website as a saved event does. */
export const onRequestPost = withApiHandler(async (context) => {
  const body = await readJsonBody(context.request);
  if (!body?.occasion || typeof body.occasion !== "object") return jsonResponse({ error: "Send the occasion as occasion." }, 400);
  const by = await resolveSessionEmail(context.request, resolveAuth(context.env)).catch(() => "");
  return problemResponse(async () => jsonResponse({ ok: true, ...(await saveOccasion(context.env, body.occasion, { by })) }));
});
