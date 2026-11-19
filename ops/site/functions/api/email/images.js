import { jsonResponse, withApiHandler } from "../../../src/platform/http.js";
import { uploadOneOffImage } from "../../../src/email/server/one-off-email.js";

/** A picture for an email's Image section (#348): uploaded to Sanity; its asset id and address back. */
export const onRequestPost = withApiHandler(async (context) => {
  return jsonResponse({ ok: true, ...(await uploadOneOffImage(context.env, await context.request.formData())) });
});
