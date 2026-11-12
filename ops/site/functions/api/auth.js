import { resolveAuth } from "../../src/access/server/auth.js";
import { opsEnv } from "../../src/platform/ops-env.js";

/**
 * How sign-in works here, for the gate page: "google", or "local" (signed in
 * automatically by npm run ops:dev).
 */
export async function onRequestGet(context) {
  const auth = resolveAuth(await opsEnv(context));
  if (auth.kind === "misconfigured") return json({ mode: "misconfigured" }, 503);
  return json({ mode: auth.kind });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
