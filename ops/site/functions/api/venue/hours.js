import { resolveAuth, resolveSessionEmail } from "../../../src/access/server/auth.js";
import { saveOpeningHours } from "../../../src/venue/server/venue-details.js";
import { jsonResponse, readJsonBody, withApiHandler } from "../../../src/platform/http.js";

/** Save the whole week of opening hours (#240); it goes on the website as a saved event does. */
export const onRequestPut = withApiHandler(async (context) => {
  const body = await readJsonBody(context.request);
  if (!body || !Array.isArray(body.days)) {
    return jsonResponse({ error: "Send the week as days." }, 400);
  }
  const by = await resolveSessionEmail(context.request, resolveAuth(context.env)).catch(() => "");
  try {
    return jsonResponse({ ok: true, ...(await saveOpeningHours(context.env, body.days, { by: by || "" })) });
  } catch (error) {
    // Each day's problem, so the page can put it under the day.
    if (error?.status === 400 && error.problems) {
      return jsonResponse({ error: error.message, problems: error.problems }, 400);
    }
    throw error;
  }
});
