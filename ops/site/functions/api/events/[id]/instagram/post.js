import { jsonResponse, readJsonBody, withApiHandler } from "../../../../../src/platform/http.js";
import { resolveAuth, resolveSessionEmail } from "../../../../../src/access/server/auth.js";
import { NOT_SET_UP, instagramServices } from "../../../../../src/instagram/server/instagram-services.js";
import { checkPost, postNow } from "../../../../../src/instagram/server/post-to-instagram.js";

/**
 * Post to Instagram now (#26): `{ date?, caption, again? }`. `check: true`
 * only has Instagram check the image and caption; nothing is posted.
 */
export const onRequestPost = withApiHandler(async (context) => {
  const id = decodeURIComponent(context.params?.id || "");
  if (!id) return jsonResponse({ error: "Missing event id." }, 400);
  const body = await readJsonBody(context.request);
  if (!body || typeof body !== "object") return jsonResponse({ error: "Invalid request." }, 400);
  const { deps, setup } = instagramServices(context.env);
  if (!setup.ready) return jsonResponse({ error: NOT_SET_UP, setup }, 409);
  const input = { eventId: id, date: String(body.date || ""), caption: String(body.caption ?? "") };
  if (body.check === true) {
    return jsonResponse({ ok: true, ...(await checkPost(deps, input)) });
  }
  const postedBy = await resolveSessionEmail(context.request, resolveAuth(context.env)).catch(() => "");
  const result = await postNow(deps, { ...input, postedBy: postedBy || "", again: body.again === true });
  return jsonResponse({ ok: true, ...result }, result.pending ? 202 : 200);
});
