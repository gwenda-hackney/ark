/**
 * Resolve ops runtime env: Cloudflare bindings/secrets + the D1 config database.
 * Cached on context.data for the request.
 */
import { applyOpsAppConfig } from "./config-store.js";

export async function opsEnv(context) {
  if (context?.data?.opsEnv) return context.data.opsEnv;
  const env = await applyOpsAppConfig(context.env || {});
  context.data = { ...(context.data || {}), opsEnv: env };
  return env;
}
