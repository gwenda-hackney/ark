import { jsonResponse, withApiHandler } from "../../../../src/platform/http.js";
import { menusForPopup } from "../../../../src/menu/server/popup-menus.js";

/** A pop-up kitchen's menus (#305), from the menu module's contract (popup-menus.js). */
export const onRequestGet = withApiHandler(async (context) => {
  const id = decodeURIComponent(context.params?.id || "");
  if (!id) return jsonResponse({ error: "Missing event id." }, 400);
  return jsonResponse({ menus: await menusForPopup(context.env, id) });
});
