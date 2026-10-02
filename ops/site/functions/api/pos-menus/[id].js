import { jsonResponse, readJsonBody, withApiHandler } from "../../../src/platform/http.js";
import { deletePosMenu, updatePosMenu } from "../../../src/menu/server/pos-menu-store.js";

export const onRequestPatch = withApiHandler(async (context) => {
  const id = context.params?.id;
  if (!id) return jsonResponse({ error: "Missing id." }, 400);
  const body = await readJsonBody(context.request);
  if (!body || typeof body !== "object") {
    return jsonResponse({ error: "Invalid request." }, 400);
  }
  const posMenu = await updatePosMenu(context.env, id, body);
  return jsonResponse({ ok: true, posMenu });
});

export const onRequestDelete = withApiHandler(async (context) => {
  const id = context.params?.id;
  if (!id) return jsonResponse({ error: "Missing id." }, 400);
  await deletePosMenu(context.env, id);
  return jsonResponse({ ok: true });
});
