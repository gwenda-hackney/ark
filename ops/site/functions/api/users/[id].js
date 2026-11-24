import { jsonResponse, readJsonBody, withApiHandler } from "../../../src/platform/http.js";
import { requestAccess } from "../../../src/access/server/access.js";
import { deleteOpsUser, updateOpsUser } from "../../../src/users/server/user-store.js";

export const onRequestPatch = withApiHandler(async (context) => {
  const id = context.params?.id;
  if (!id) return jsonResponse({ error: "Missing id." }, 400);
  const body = await readJsonBody(context.request);
  if (!body || typeof body !== "object") {
    return jsonResponse({ error: "Invalid request." }, 400);
  }
  const user = await updateOpsUser(context.env, id, body, await requestAccess(context));
  return jsonResponse({ ok: true, user });
});

export const onRequestDelete = withApiHandler(async (context) => {
  const id = context.params?.id;
  if (!id) return jsonResponse({ error: "Missing id." }, 400);
  await deleteOpsUser(context.env, id, await requestAccess(context));
  return jsonResponse({ ok: true });
});
