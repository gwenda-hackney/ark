import { jsonResponse, withApiHandler } from "../../../../src/platform/http.js";
import { instagramServices } from "../../../../src/instagram/server/instagram-services.js";
import { draftPost } from "../../../../src/instagram/server/post-to-instagram.js";

/** The Instagram tab: what a post would be, and what was posted (#26). `?date=` for a night. */
export const onRequestGet = withApiHandler(async (context) => {
  const id = decodeURIComponent(context.params?.id || "");
  if (!id) return jsonResponse({ error: "Missing event id." }, 400);
  const date = new URL(context.request.url).searchParams.get("date") || "";
  const { deps, setup } = instagramServices(context.env);
  const draft = await draftPost(deps, { eventId: id, date });
  return jsonResponse({ setup, draft });
});
