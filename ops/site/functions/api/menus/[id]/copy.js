import { jsonResponse, withApiHandler } from "../../../../src/platform/http.js";
import { copyMenu } from "../../../../src/menu/server/menus.js";

/** Copy menu (#306): a new menu from this one, with its sections but no dates or items. */
export const onRequestPost = withApiHandler(async (context) => {
  const id = decodeURIComponent(context.params?.id || "");
  if (!id) return jsonResponse({ error: "Missing menu id." }, 400);
  return jsonResponse({ ok: true, menu: await copyMenu(context.env, id) }, 201);
});
