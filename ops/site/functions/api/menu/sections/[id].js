import { jsonResponse, readJsonBody, withApiHandler } from "../../../../src/platform/http.js";
import {
  deleteMenuSection,
  previewSectionRemoval,
  removeMenuSection,
  updateMenuSection,
} from "../../../../src/menu/server/menu-store.js";
import { toClientSection } from "../../../../src/inventory/server/reconcile.js";

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

/** GET: what removing it would take with it (its groups; items deleted or only taken off). */
export const onRequestGet = withApiHandler(async (context) => {
  const id = sectionId(context);
  if (!id) return jsonResponse({ error: "Missing section id." }, 400);
  return jsonResponse({ ok: true, removal: await previewSectionRemoval(context.env, id) });
});

/**
 * DELETE: an empty section. With ?with=items it is removed from its menu
 * with its groups, and its items come off the menu (deleted when on no other).
 */
export const onRequestDelete = withApiHandler(async (context) => {
  const id = sectionId(context);
  if (!id) return jsonResponse({ error: "Missing section id." }, 400);
  const withItems = new URL(context.request.url).searchParams.get("with") === "items";
  const result = withItems ? await removeMenuSection(context.env, id) : await deleteMenuSection(context.env, id);
  return jsonResponse({ ok: true, ...result });
});
