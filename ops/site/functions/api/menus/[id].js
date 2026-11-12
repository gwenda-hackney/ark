import { jsonResponse, readJsonBody, withApiHandler } from "../../../src/platform/http.js";
import { toClientSections } from "../../../src/inventory/server/reconcile.js";
import { deleteMenu, getMenu, updateMenu } from "../../../src/menu/server/menus.js";

function menuId(context) {
  return decodeURIComponent(context.params?.id || "");
}

/** One menu (#305) with its sections, every menu (to move a chapter to) and the pop-up kitchens. */
export const onRequestGet = withApiHandler(async (context) => {
  const id = menuId(context);
  if (!id) return jsonResponse({ error: "Missing menu id." }, 400);
  const { sections, ...rest } = await getMenu(context.env, id);
  return jsonResponse({ ...rest, sections: toClientSections(sections) });
});

export const onRequestPatch = withApiHandler(async (context) => {
  const id = menuId(context);
  if (!id) return jsonResponse({ error: "Missing menu id." }, 400);
  const body = await readJsonBody(context.request);
  if (!body || typeof body !== "object") {
    return jsonResponse({ error: "Invalid request." }, 400);
  }
  const menu = await updateMenu(context.env, id, body);
  return jsonResponse({ ok: true, menu });
});

/** Only a menu with no sections can go. */
export const onRequestDelete = withApiHandler(async (context) => {
  const id = menuId(context);
  if (!id) return jsonResponse({ error: "Missing menu id." }, 400);
  return jsonResponse({ ok: true, ...(await deleteMenu(context.env, id)) });
});
