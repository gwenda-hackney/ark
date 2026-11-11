import { jsonResponse, withApiHandler } from "../../../src/platform/http.js";
import { createMenuItem, loadMenuTree } from "../../../src/menu/server/menu-store.js";
import { listPosMenus } from "../../../src/menu/server/pos-menu-store.js";
import { listPopupSeries } from "../../../src/events/server/popups.js";
import { readJsonBody } from "../../../src/platform/http.js";
import { toClientItem, toClientSections } from "../../../src/inventory/server/reconcile.js";

export const onRequestGet = withApiHandler(async (context) => {
  const [{ sections }, posMenus, popups] = await Promise.all([
    loadMenuTree(context.env),
    listPosMenus(context.env),
    listPopupSeries(context.env),
  ]);
  return jsonResponse({
    sections: toClientSections(sections),
    posMenus,
    // Pop-up kitchens a food chapter can belong to (Configuration, Menu sections).
    popups: popups.map(({ id, name }) => ({ id, name })),
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
