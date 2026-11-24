import { jsonResponse, readJsonBody, withApiHandler } from "../../../src/platform/http.js";
import { requestAccess } from "../../../src/access/server/access.js";
import { deleteRole, updateRole } from "../../../src/users/server/role-store.js";

/** Rename a role or change its levels: `{ name?, areas? }`. Owners only; never the Owner role. */
export const onRequestPatch = withApiHandler(async (context) => {
  const body = await readJsonBody(context.request);
  if (!body || typeof body !== "object") return jsonResponse({ error: "Invalid request." }, 400);
  const role = await updateRole(context.env, await requestAccess(context), context.params?.id, body);
  return jsonResponse({ ok: true, role });
});

/** Remove a role; its people get the default role. Owners only. */
export const onRequestDelete = withApiHandler(async (context) => {
  await deleteRole(context.env, await requestAccess(context), context.params?.id);
  return jsonResponse({ ok: true });
});
