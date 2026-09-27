import { jsonResponse, readJsonBody, withApiHandler } from "../../../../src/platform/http.js";
import {
  deleteMenuSection,
  updateMenuSection,
} from "../../../../src/features/menu/server/menu-store.js";
import { toClientSection } from "../../../../src/features/inventory/server/reconcile.js";

function sectionId(context) {
  return decodeURIComponent(context.params?.id || "");
}

export const onRequestPatch = withApiHandler(async (context) => {
  const id = sectionId(context);
  if (!id) return jsonResponse({ error: "Missing section id." }, 400);
  const body = await readJsonBody(context.request);
  if (!body || typeof body !== "object") {
    return jsonResponse({ error: "Invalid request." }, 400);
  }
  const section = await updateMenuSection(context.env, id, body);
  return jsonResponse({ ok: true, section: toClientSection(section) });
});

export const onRequestDelete = withApiHandler(async (context) => {
  const id = sectionId(context);
  if (!id) return jsonResponse({ error: "Missing section id." }, 400);
  const result = await deleteMenuSection(context.env, id);
  return jsonResponse({ ok: true, ...result });
});
