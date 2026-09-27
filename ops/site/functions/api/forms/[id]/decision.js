import { jsonResponse, readJsonBody, withApiHandler } from "../../../../src/platform/http.js";
import { setFormDecision } from "../../../../src/features/forms/server/form-submissions.js";

/** POST { decision: "Approved" | "Declined" | "" } → ops' answer to an application. */
export const onRequestPost = withApiHandler(async (context) => {
  const id = decodeURIComponent(context.params?.id || "");
  if (!id) return jsonResponse({ error: "Missing submission id." }, 400);
  const body = await readJsonBody(context.request);
  return jsonResponse(await setFormDecision(context.env, id, body?.decision));
});
