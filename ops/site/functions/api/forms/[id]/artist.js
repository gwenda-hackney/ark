import { jsonResponse, readJsonBody, withApiHandler } from "../../../../src/platform/http.js";
import { setFormArtist } from "../../../../src/features/forms/server/form-submissions.js";

/** POST { name, link } → ops' copy of this applicant's artist name and link. */
export const onRequestPost = withApiHandler(async (context) => {
  const id = decodeURIComponent(context.params?.id || "");
  if (!id) return jsonResponse({ error: "Missing submission id." }, 400);
  const body = await readJsonBody(context.request);
  return jsonResponse(
    await setFormArtist(context.env, id, { name: body?.name, link: body?.link }),
  );
});
