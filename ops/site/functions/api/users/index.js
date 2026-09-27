import { jsonResponse, readJsonBody, withApiHandler } from "../../../src/platform/http.js";
import { createOpsUser, listOpsUsers } from "../../../src/users/server/user-store.js";

export const onRequestGet = withApiHandler(async (context) => {
  const users = await listOpsUsers(context.env);
  return jsonResponse({ users });
});

export const onRequestPost = withApiHandler(async (context) => {
  const body = await readJsonBody(context.request);
  if (!body || typeof body !== "object") {
    return jsonResponse({ error: "Invalid request." }, 400);
  }
  const user = await createOpsUser(context.env, body);
  return jsonResponse({ ok: true, user }, 201);
});
