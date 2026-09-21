import { jsonResponse, withApiHandler } from "../../_lib/http.js";
import { createMenuItem, loadMenuTree } from "../../_lib/menu-store.js";
import { listPosMenus } from "../../_lib/pos-menu-store.js";
import { readJsonBody } from "../../_lib/http.js";
import { toClientItem, toClientSections } from "../../_lib/reconcile.js";

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
