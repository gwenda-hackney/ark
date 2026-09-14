import { jsonResponse, readJsonBody, withApiHandler } from "../../_lib/http.js";
import { deleteMenuItem, loadMenuTree, updateMenuItem } from "../../_lib/menu-store.js";

function itemId(context) {
  return decodeURIComponent(context.params?.id || "");
}

export const onRequestGet = withApiHandler(async (context) => {
  const id = itemId(context);
  if (!id) return jsonResponse({ error: "Missing item id." }, 400);
  const { items } = await loadMenuTree(context.env);
  const item = items.find((entry) => entry._id === id);
  if (!item) return jsonResponse({ error: "Item not found." }, 404);
  return jsonResponse({ item });
});

export const onRequestPatch = withApiHandler(async (context) => {
  const id = itemId(context);
  if (!id) return jsonResponse({ error: "Missing item id." }, 400);
  const body = await readJsonBody(context.request);
  if (!body || typeof body !== "object") {
    return jsonResponse({ error: "Invalid request." }, 400);
  }
  const item = await updateMenuItem(context.env, id, body);
  return jsonResponse({ ok: true, item });
});

export const onRequestDelete = withApiHandler(async (context) => {
  const id = itemId(context);
  if (!id) return jsonResponse({ error: "Missing item id." }, 400);
  const result = await deleteMenuItem(context.env, id);
  return jsonResponse({ ok: true, ...result });
});
