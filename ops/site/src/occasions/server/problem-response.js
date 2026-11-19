import { jsonResponse } from "../../platform/http.js";

/** An occasion with something wrong: each field's problem, for the page to put under it. */
export async function problemResponse(run) {
  try {
    return await run();
  } catch (error) {
    if (error?.status === 400 && error.problems) {
      return jsonResponse({ error: error.message, problems: error.problems }, 400);
    }
    throw error;
  }
}
