import { jsonResponse, withApiHandler } from "../../../src/platform/http.js";
import { runsOnMachine } from "../../../src/platform/sanity.js";
import { SITES, autoUpdateTick } from "../../../src/website/server/site-pending.js";
import { runWebsiteJob } from "../../../src/events/server/website-jobs.js";
import { runDriveMirrorJob } from "../../../src/events/server/event-drive-mirror.js";

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
 * for when nobody has ops open, and the events' Drive copy (#183). Each step
 * is its own request (`?step=jobs`, `?step=drive`) so it gets its own
 * Cloudflare call allowance; so is each site's check (`?step=site&site=…`).
 */
export const onRequestPost = withApiHandler(async (context) => {
  const header = context.request.headers.get("Authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const secret = String(context.env.DEPLOY_WEBHOOK_SECRET || "").trim();
  if (!sameSecret(token, secret)) return jsonResponse({ error: "Unauthorized" }, 401);
  if (runsOnMachine(context.env)) return jsonResponse({ ok: true, skipped: "local" });
  const url = new URL(context.request.url);
  const step = url.searchParams.get("step");
  if (step === "jobs") return jsonResponse({ ok: true, job: await runWebsiteJob(context.env) });
  if (step === "drive") return jsonResponse({ ok: true, drive: await runDriveMirrorJob(context.env) });
  const site = url.searchParams.get("site");
  if (step === "site" && SITES.includes(site)) {
    return jsonResponse({ ok: true, sites: await autoUpdateTick(context.env, { sites: [site] }) });
  }
  const call = (params) => {
    const next = new URL(url);
    for (const [key, value] of Object.entries(params)) next.searchParams.set(key, value);
    return fetch(next.toString(), { method: "POST", headers: { Authorization: header } });
  };
  const background = ["jobs", "drive"].map((name) => call({ step: name }).catch(() => null));
  if (typeof context.waitUntil === "function") context.waitUntil(Promise.all(background));
  // Each site is its own request too, so each gets its own CPU allowance (#235).
  // Waiting for them costs this request no CPU, and a failure still shows here.
  const sites = {};
  let failed = "";
  await Promise.all(
    SITES.map(async (name) => {
      const res = await call({ step: "site", site: name }).catch((error) => ({ ok: false, status: 0, error }));
      const body = res.ok ? await res.json().catch(() => null) : null;
      sites[name] = body?.sites?.[name] ?? { action: "error", status: res.status || 0 };
      if (!res.ok) failed ||= `${name}: ${res.status || res.error?.message || "no response"}`;
    }),
  );
  if (failed) return jsonResponse({ ok: false, error: `Site check failed (${failed}).`, sites }, 500);
  return jsonResponse({ ok: true, sites });
});
