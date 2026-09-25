import { jsonResponse, withApiHandler } from "../../_lib/http.js";
import { isLocalOps } from "../../_lib/sanity.js";
import { autoUpdateTick } from "../../_lib/site-pending.js";

function sameSecret(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Scheduler pass, called every few minutes by the site-deploy webhook's cron
 * with the shared DEPLOY_WEBHOOK_SECRET. Public path: no user session.
 */
export const onRequestPost = withApiHandler(async (context) => {
  const header = context.request.headers.get("Authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const secret = String(context.env.DEPLOY_WEBHOOK_SECRET || "").trim();
  if (!sameSecret(token, secret)) return jsonResponse({ error: "Unauthorized" }, 401);
  if (isLocalOps(context.env)) return jsonResponse({ ok: true, skipped: "local" });
  return jsonResponse({ ok: true, sites: await autoUpdateTick(context.env) });
});
