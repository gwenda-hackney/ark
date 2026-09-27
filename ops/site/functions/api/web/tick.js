import { jsonResponse, withApiHandler } from "../../../src/platform/http.js";
import { runsOnMachine } from "../../../src/platform/sanity.js";
import { autoUpdateTick } from "../../../src/features/web/server/site-pending.js";
import { runWebsiteJob } from "../../../src/features/events/server/website-jobs.js";

function sameSecret(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Scheduler pass, called every few minutes by the site-deploy webhook's cron
 * with the shared DEPLOY_WEBHOOK_SECRET. Public path: no user session.
 *
 * It also moves the "getting ready for the website" queue on by one step,
 * for when nobody has ops open. That step is its own request (`?step=jobs`)
 * so it gets its own Cloudflare call allowance.
 */
export const onRequestPost = withApiHandler(async (context) => {
  const header = context.request.headers.get("Authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const secret = String(context.env.DEPLOY_WEBHOOK_SECRET || "").trim();
  if (!sameSecret(token, secret)) return jsonResponse({ error: "Unauthorized" }, 401);
  if (runsOnMachine(context.env)) return jsonResponse({ ok: true, skipped: "local" });
  const url = new URL(context.request.url);
  if (url.searchParams.get("step") === "jobs") {
    return jsonResponse({ ok: true, job: await runWebsiteJob(context.env) });
  }
  url.searchParams.set("step", "jobs");
  const jobs = fetch(url.toString(), { method: "POST", headers: { Authorization: header } }).catch(
    () => null,
  );
  if (typeof context.waitUntil === "function") context.waitUntil(jobs);
  return jsonResponse({ ok: true, sites: await autoUpdateTick(context.env) });
});
