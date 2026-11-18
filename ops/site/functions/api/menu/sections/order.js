import { jsonResponse, readJsonBody, withApiHandler } from "../../../../src/platform/http.js";
import { orderMenuSections } from "../../../../src/menu/server/menu-store.js";

/** POST { ids }: one menu's chapters, or one chapter's groups, in their new order. */
export const onRequestPost = withApiHandler(async (context) => {
  const body = await readJsonBody(context.request);
  if (!body || typeof body !== "object" || !Array.isArray(body.ids)) {
    return jsonResponse({ error: "Invalid request." }, 400);
  }
  const result = await orderMenuSections(context.env, body.ids);
  return jsonResponse({ ok: true, ...result });
});
