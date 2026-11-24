import {
  opsUserForbiddenResponse,
  resolveAuth,
  resolveSessionEmail,
  signInRequiredResponse,
} from "../../../src/access/server/auth.js";
import { opsConnectionInfo } from "../../../src/platform/config-store.js";
import { opsEnv } from "../../../src/platform/ops-env.js";
import { accessFor } from "../../../src/access/server/access.js";
import { isOpsUser } from "../../../src/users/server/user-store.js";
import { frozenFeatures } from "../../../../../shared/write-freeze.js";

/** Current session identity and database connection for the shell. */
export async function onRequestGet(context) {
  const env = await opsEnv(context);
  const auth = resolveAuth(env);
  if (auth.kind === "misconfigured") {
    return new Response(JSON.stringify({ error: "Auth is not configured." }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }
  const email = await resolveSessionEmail(context.request, auth);
  if (!email) return signInRequiredResponse();
  // /api/auth is open in the middleware, so check the users list here too:
  // someone taken off it mid-session gets a 403, not their profile (#151).
  if (!(await isOpsUser(env, email))) {
    return opsUserForbiddenResponse({ json: true });
  }
  const connection = opsConnectionInfo(env);
  const access = await accessFor(env, email).catch(() => null);
  return new Response(
    JSON.stringify({
      email,
      // "google", or "local": signed in automatically by npm run ops:dev.
      mode: auth.kind,
      siteEnv: connection.siteEnv,
      envLabel: connection.envLabel,
      databaseId: connection.databaseId,
      databaseLabel: connection.databaseLabel,
      isProductionDb: connection.isProductionDb,
      risk: connection.risk,
      // An owner: everything (#375; "admin" before roles).
      isAdmin: Boolean(access?.owner),
      // Their role and level on every area of ops (src/access/areas.js).
      access: access ? { owner: access.owner, role: access.role, levels: access.levels } : null,
      // Features whose data is moving to D1 right now: read-only (#191).
      frozen: await frozenFeatures(context.env),
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    },
  );
}
