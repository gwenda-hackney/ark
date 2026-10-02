import { jsonResponse, readJsonBody, withApiHandler } from "../../../src/platform/http.js";
import { createPosMenu, listPosMenus } from "../../../src/menu/server/pos-menu-store.js";

export const onRequestGet = withApiHandler(async (context) => {
  const posMenus = await listPosMenus(context.env);
  return jsonResponse({ posMenus });
});

export const onRequestPost = withApiHandler(async (context) => {
  const body = await readJsonBody(context.request);
  if (!body || typeof body !== "object") {
    return jsonResponse({ error: "Invalid request." }, 400);
  }
  const posMenu = await createPosMenu(context.env, body);
  return jsonResponse({ ok: true, posMenu }, 201);
});
