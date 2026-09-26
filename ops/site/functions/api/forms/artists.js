import { jsonResponse, withApiHandler } from "../../_lib/http.js";
import { listApprovedArtists } from "../../_lib/form-submissions.js";

/** Approved play applications, for the Guest Artist picker on events. */
export const onRequestGet = withApiHandler(async (context) => {
  const artists = await listApprovedArtists(context.env);
  return jsonResponse({ artists });
});
