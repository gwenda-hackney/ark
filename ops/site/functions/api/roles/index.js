import { jsonResponse, readJsonBody, withApiHandler } from "../../../src/platform/http.js";
import { requestAccess } from "../../../src/access/server/access.js";
import { createRole, listRoles } from "../../../src/users/server/role-store.js";

/** Every role with its levels by area and how many have it (#375). The Users area. */
export const onRequestGet = withApiHandler(async (context) => {
  return jsonResponse({ roles: await listRoles(context.env) });
});

/** A new role: `{ name, areas }`. Owners only. */
export const onRequestPost = withApiHandler(async (context) => {
  const body = await readJsonBody(context.request);
  if (!body || typeof body !== "object") return jsonResponse({ error: "Invalid request." }, 400);
  const role = await createRole(context.env, await requestAccess(context), body);
  return jsonResponse({ ok: true, role }, 201);
});
