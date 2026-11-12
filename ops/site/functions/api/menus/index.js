import { jsonResponse, readJsonBody, withApiHandler } from "../../../src/platform/http.js";
import { createMenu, listMenus } from "../../../src/menu/server/menus.js";

/** Every menu (#305), with its status and item count, and the pop-up kitchens a menu can belong to. */
export const onRequestGet = withApiHandler(async (context) => {
  return jsonResponse(await listMenus(context.env));
});

/** Add a menu: { name, kind, startsOn, endsOn, days, popupSeriesId }. */
export const onRequestPost = withApiHandler(async (context) => {
  const body = await readJsonBody(context.request);
  if (!body || typeof body !== "object") {
    return jsonResponse({ error: "Invalid request." }, 400);
  }
  const menu = await createMenu(context.env, body);
  return jsonResponse({ ok: true, menu }, 201);
});
