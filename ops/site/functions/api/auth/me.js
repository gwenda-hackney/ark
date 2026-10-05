import {
  isRequestAuthed,
  opsUserForbiddenResponse,
  resolveAuth,
  resolveSessionEmail,
  signInRequiredResponse,
} from "../../../src/access/server/auth.js";
import { opsConnectionInfo } from "../../../src/platform/config-store.js";
import { opsEnv } from "../../../src/platform/ops-env.js";
import { resolveOpsTableIds } from "../../../../../shared/baserow.js";
import { isOpsAdmin } from "../../../src/access/server/admin.js";
import { isOpsUser } from "../../../src/users/server/user-store.js";
import { frozenFeatures } from "../../../../../shared/write-freeze.js";

/** Current session identity and Baserow connection for the shell. */
export async function onRequestGet(context) {
  const env = await opsEnv(context);
  const auth = resolveAuth(env);
  if (auth.kind === "misconfigured") {
    return new Response(JSON.stringify({ error: "Auth is not configured." }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (!(await isRequestAuthed(auth, context.request))) {
    return signInRequiredResponse();
  }

  const email = await resolveSessionEmail(context.request, auth);
  // /api/auth is open in the middleware, so check the users list here too:
  // someone taken off it mid-session gets a 403, not their profile (#151).
  if (auth.kind === "google" && email && !(await isOpsUser(env, email))) {
    return opsUserForbiddenResponse({ json: true });
  }
  const resolved = await resolveOpsTableIds(env).catch(() => null);
  const connection = opsConnectionInfo(env, resolved?.databaseId);
  return new Response(
    JSON.stringify({
      email: email || null,
      mode: auth.kind,
      siteEnv: connection.siteEnv,
      envLabel: connection.envLabel,
      databaseId: connection.databaseId,
      databaseLabel: connection.databaseLabel,
      isProductionDb: connection.isProductionDb,
      risk: connection.risk,
      isAdmin: await isOpsAdmin(env, email).catch(() => false),
      // Features whose data is moving to D1 right now: read-only (#191).
      frozen: await frozenFeatures(context.env),
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    },
  );
}
