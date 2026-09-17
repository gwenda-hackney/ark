import {
  isRequestAuthed,
  resolveAuth,
  resolveSessionEmail,
  signInRequiredResponse,
} from "../../_lib/auth.js";
import { opsEnv } from "../../_lib/ops-env.js";

/** Current session identity for the shell. */
export async function onRequestGet(context) {
  const auth = resolveAuth(await opsEnv(context));
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
  return new Response(
    JSON.stringify({
      email: email || null,
      mode: auth.kind,
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    },
  );
}
