import { jsonResponse, withApiHandler } from "../../../src/platform/http.js";
import { listApprovedArtists } from "../../../src/features/forms/server/form-submissions.js";

/** Approved play applications, for the Guest Artist picker on events. */
export const onRequestGet = withApiHandler(async (context) => {
  const artists = await listApprovedArtists(context.env);
  return jsonResponse({ artists });
});
