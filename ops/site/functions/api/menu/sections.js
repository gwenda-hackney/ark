import { jsonResponse, readJsonBody, withApiHandler } from "../../_lib/http.js";
import { createMenuSection } from "../../_lib/menu-store.js";
import { toClientSection } from "../../_lib/reconcile.js";

export const onRequestPost = withApiHandler(async (context) => {
  const body = await readJsonBody(context.request);
  if (!body || typeof body !== "object") {
    return jsonResponse({ error: "Invalid request." }, 400);
  }
  const section = await createMenuSection(context.env, body);
  return jsonResponse({ ok: true, section: toClientSection(section) }, 201);
});
