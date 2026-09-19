import {
  isRequestAuthed,
  resolveAuth,
  resolveSessionEmail,
  signInRequiredResponse,
} from "../../_lib/auth.js";
import { opsConnectionInfo } from "../../_lib/config-store.js";
import { opsEnv } from "../../_lib/ops-env.js";

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
  const connection = opsConnectionInfo(env);
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
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    },
  );
}
