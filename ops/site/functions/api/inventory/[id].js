import { jsonResponse, readJsonBody, withApiHandler } from "../../../src/platform/http.js";
import {
  deleteInventoryItem,
  updateInventoryItem,
} from "../../../src/inventory/server/inventory-store.js";

export const onRequestPatch = withApiHandler(async (context) => {
  const id = context.params?.id;
  if (!id) return jsonResponse({ error: "Missing id." }, 400);
  const body = await readJsonBody(context.request);
  if (!body || typeof body !== "object") {
    return jsonResponse({ error: "Invalid request." }, 400);
  }
  const item = await updateInventoryItem(context.env, id, body);
  return jsonResponse({ ok: true, item });
});

export const onRequestDelete = withApiHandler(async (context) => {
  const id = context.params?.id;
  if (!id) return jsonResponse({ error: "Missing id." }, 400);
  await deleteInventoryItem(context.env, id);
  return jsonResponse({ ok: true });
});
