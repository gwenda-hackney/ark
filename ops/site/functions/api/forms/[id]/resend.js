import { jsonResponse, readJsonBody, withApiHandler } from "../../../_lib/http.js";
import { resendFormEmail } from "../../../_lib/form-submissions.js";

/** POST { kind: "notify" | "receipt" } → resend that email via the website. */
export const onRequestPost = withApiHandler(async (context) => {
  const id = decodeURIComponent(context.params?.id || "");
  if (!id) return jsonResponse({ error: "Missing submission id." }, 400);
  const body = await readJsonBody(context.request);
  const result = await resendFormEmail(context.env, id, String(body?.kind ?? ""));
  return jsonResponse(result);
});
