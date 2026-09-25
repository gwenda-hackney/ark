import { runDeepHealth } from "../../_lib/deep-health.js";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function sameSecret(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * POST /api/health/deep  { sendEmail?: boolean, formTest?: boolean, label?: string }
 * formTest submits the play form end to end (emails to alerts@, row deleted).
 * Bearer DEPLOY_WEBHOOK_SECRET. 200 when every dependency answers, 503 if not.
 */
export async function onRequestPost(context) {
  const env = context.env || {};
  const header = context.request.headers.get("Authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!sameSecret(token, String(env.DEPLOY_WEBHOOK_SECRET || "").trim())) {
    return json({ error: "Unauthorized" }, 401);
  }
  const body = await context.request.json().catch(() => ({}));
  const result = await runDeepHealth(env, {
    sendEmail: body?.sendEmail === true,
    formTest: body?.formTest === true,
    requestUrl: context.request.url,
    label: String(body?.label || "").slice(0, 120),
  });
  return json({ ok: result.ok, env: env.SITE_ENV || null, checks: result.checks }, result.ok ? 200 : 503);
}
