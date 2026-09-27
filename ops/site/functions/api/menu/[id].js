import { jsonResponse, readJsonBody, withApiHandler } from "../../../src/platform/http.js";
import { deleteMenuItem, loadMenuTree, updateMenuItem, archiveMenuItem } from "../../../src/menu/server/menu-store.js";
import { toClientItem } from "../../../src/inventory/server/reconcile.js";

function itemId(context) {
  return decodeURIComponent(context.params?.id || "");
}

export const onRequestGet = withApiHandler(async (context) => {
  const id = itemId(context);
  if (!id) return jsonResponse({ error: "Missing item id." }, 400);
  const { items } = await loadMenuTree(context.env);
  const item = items.find((entry) => entry._id === id);
  if (!item) return jsonResponse({ error: "Item not found." }, 404);
  return jsonResponse({ item: toClientItem(item) });
});

export const onRequestPatch = withApiHandler(async (context) => {
  const id = itemId(context);
  if (!id) return jsonResponse({ error: "Missing item id." }, 400);
  const body = await readJsonBody(context.request);
  if (!body || typeof body !== "object") {
    return jsonResponse({ error: "Invalid request." }, 400);
  }
  const item =
    body.archived === true || body.archive === true
      ? await archiveMenuItem(context.env, id)
      : await updateMenuItem(context.env, id, body);
  return jsonResponse({ ok: true, item: toClientItem(item) });
});

export const onRequestDelete = withApiHandler(async (context) => {
  const id = itemId(context);
  if (!id) return jsonResponse({ error: "Missing item id." }, 400);
  const result = await deleteMenuItem(context.env, id);
  return jsonResponse({ ok: true, ...result });
});
