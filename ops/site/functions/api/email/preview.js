import { jsonResponse, withApiHandler } from "../../../src/platform/http.js";
import { buildWeeklyEmail } from "../../../src/email/server/weekly-email-build.js";

/**
 * This week's email as it would go out right now. Anyone signed in. When it
 * can't be built the page says why (`problem`) instead of a blank error.
 */
export const onRequestGet = withApiHandler(async (context) => {
  try {
    const { text: _text, ...email } = await buildWeeklyEmail(context.env);
    return jsonResponse({ ok: true, email, problem: "" });
  } catch (error) {
    if (error?.status !== 502) throw error;
    return jsonResponse({ ok: true, email: null, problem: error.message });
  }
});
