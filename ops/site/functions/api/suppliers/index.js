import { jsonResponse, readJsonBody, withApiHandler } from "../../../src/platform/http.js";
import { createSupplier, listSuppliers } from "../../../src/inventory/server/inventory-store.js";

export const onRequestGet = withApiHandler(async (context) => {
  const suppliers = await listSuppliers(context.env);
  return jsonResponse({ suppliers });
});

export const onRequestPost = withApiHandler(async (context) => {
  const body = await readJsonBody(context.request);
  if (!body || typeof body !== "object") {
    return jsonResponse({ error: "Invalid request." }, 400);
  }
  const supplier = await createSupplier(context.env, body);
  return jsonResponse({ ok: true, supplier }, 201);
});
