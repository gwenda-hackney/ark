import { jsonResponse, withApiHandler } from "../../../src/platform/http.js";
import { createMenuItem, loadMenuTree } from "../../../src/menu/server/menu-store.js";
import { listPosMenus } from "../../../src/menu/server/pos-menu-store.js";
import { readJsonBody } from "../../../src/platform/http.js";
import { toClientItem, toClientSections } from "../../../src/inventory/server/reconcile.js";

export const onRequestGet = withApiHandler(async (context) => {
  const [{ sections }, posMenus] = await Promise.all([
    loadMenuTree(context.env),
    listPosMenus(context.env),
  ]);
  return jsonResponse({
    sections: toClientSections(sections),
    posMenus,
  });
});

export const onRequestPost = withApiHandler(async (context) => {
  const body = await readJsonBody(context.request);
  if (!body || typeof body !== "object") {
    return jsonResponse({ error: "Invalid request." }, 400);
  }
  const item = await createMenuItem(context.env, body);
  return jsonResponse({ ok: true, item: toClientItem(item) }, 201);
});
