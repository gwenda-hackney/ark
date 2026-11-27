import { jsonResponse, readJsonBody, withApiHandler } from "../../../../src/platform/http.js";
import { setFormArchived } from "../../../../src/forms/server/form-submissions.js";

/** POST { archived: true | false } → off the Enquiries list, or back on it (#390). */
export const onRequestPost = withApiHandler(async (context) => {
  const id = decodeURIComponent(context.params?.id || "");
  if (!id) return jsonResponse({ error: "Missing submission id." }, 400);
  const body = await readJsonBody(context.request);
  return jsonResponse(await setFormArchived(context.env, id, Boolean(body?.archived)));
});
