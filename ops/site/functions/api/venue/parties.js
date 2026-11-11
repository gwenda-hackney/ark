import { resolveAuth, resolveSessionEmail } from "../../../src/access/server/auth.js";
import { saveParties } from "../../../src/venue/server/venue-details.js";
import { jsonResponse, readJsonBody, withApiHandler } from "../../../src/platform/http.js";

/** Save the party facts (#240), any of them blank; they go on the website as a saved event does. */
export const onRequestPut = withApiHandler(async (context) => {
  const body = await readJsonBody(context.request);
  if (!body || !body.parties || typeof body.parties !== "object" || Array.isArray(body.parties)) {
    return jsonResponse({ error: "Send the party details as parties." }, 400);
  }
  const by = await resolveSessionEmail(context.request, resolveAuth(context.env)).catch(() => "");
  try {
    return jsonResponse({ ok: true, ...(await saveParties(context.env, body.parties, { by: by || "" })) });
  } catch (error) {
    // Each fact's problem, so the page can put it under the field.
    if (error?.status === 400 && error.problems) {
      return jsonResponse({ error: error.message, problems: error.problems }, 400);
    }
    throw error;
  }
});
