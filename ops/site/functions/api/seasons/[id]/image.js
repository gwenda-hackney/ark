import { resolveAuth, resolveSessionEmail } from "../../../../src/access/server/auth.js";
import { jsonResponse, withApiHandler } from "../../../../src/platform/http.js";
import { readImageUpload } from "../../../../src/platform/image-upload.js";
import { setSeasonImage } from "../../../../src/seasons/server/seasons.js";

const seasonId = (context) => Number(context.params?.id);

/** Give a season its picture (#353): a form with the photo as `file` and its description as `alt`. */
export const onRequestPost = withApiHandler(async (context) => {
  const form = await context.request.formData();
  const upload = await readImageUpload(form, "season.jpg");
  const alt = String(form.get("alt") ?? "").trim();
  const by = await resolveSessionEmail(context.request, resolveAuth(context.env)).catch(() => "");
  return jsonResponse({ ok: true, ...(await setSeasonImage(context.env, seasonId(context), upload, { alt, by })) });
});

/** Take its picture off. */
export const onRequestDelete = withApiHandler(async (context) => {
  const by = await resolveSessionEmail(context.request, resolveAuth(context.env)).catch(() => "");
  return jsonResponse({ ok: true, ...(await setSeasonImage(context.env, seasonId(context), null, { by })) });
});
