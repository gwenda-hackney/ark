import { jsonResponse, readJsonBody, withApiHandler } from "../../../src/platform/http.js";
import { deleteSupplier, updateSupplier } from "../../../src/inventory/server/inventory-store.js";

export const onRequestPatch = withApiHandler(async (context) => {
  const id = context.params?.id;
  if (!id) return jsonResponse({ error: "Missing id." }, 400);
  const body = await readJsonBody(context.request);
  if (!body || typeof body !== "object") {
    return jsonResponse({ error: "Invalid request." }, 400);
  }
  const supplier = await updateSupplier(context.env, id, body);
  return jsonResponse({ ok: true, supplier });
});

export const onRequestDelete = withApiHandler(async (context) => {
  const id = context.params?.id;
  if (!id) return jsonResponse({ error: "Missing id." }, 400);
  await deleteSupplier(context.env, id);
  return jsonResponse({ ok: true });
});
