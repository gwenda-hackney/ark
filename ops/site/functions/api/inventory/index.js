import { jsonResponse, readJsonBody, withApiHandler } from "../../_lib/http.js";
import {
  createInventoryItem,
  listInventory,
} from "../../_lib/inventory-store.js";

export const onRequestGet = withApiHandler(async (context) => {
  const url = new URL(context.request.url);
  const includeInactive = url.searchParams.get("all") === "1";
  const items = await listInventory(context.env, { includeInactive });
  return jsonResponse({ items });
});

export const onRequestPost = withApiHandler(async (context) => {
  const body = await readJsonBody(context.request);
  if (!body || typeof body !== "object") {
    return jsonResponse({ error: "Invalid request." }, 400);
  }
  const item = await createInventoryItem(context.env, body);
  return jsonResponse({ ok: true, item }, 201);
});
