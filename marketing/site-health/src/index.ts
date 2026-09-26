import { isGmailConfigured } from "../../../shared/gmail-send.js";
import { sendHealthAlert } from "./alert";
import {
  interpretProbe,
  lastErrorFromProbe,
  monitoredSites,
  nextHealthState,
  parseHealthState,
  probeSite,
  stateKeyFor,
} from "./health";
import type { Env, HealthState, ProbeResult, SiteId } from "./types";

async function readState(env: Env, id: SiteId): Promise<HealthState> {
  const raw = await env.HEALTH_STATE.get(stateKeyFor(id));
  return parseHealthState(raw);
}

export async function runHealthCheck(
  env: Env,
  deps: {
    probe?: typeof probeSite;
    sendAlert?: typeof sendHealthAlert;
    now?: number;
    siteId?: SiteId;
    siteUrl?: string;
    requireHome?: boolean;
    alert?: boolean;
  } = {},
): Promise<{ ok: boolean; alert: string | null; probe: ProbeResult }> {
  const siteId = deps.siteId || "production";
  const siteUrl =
    deps.siteUrl ||
    (siteId === "preview"
      ? env.PREVIEW_SITE_URL?.trim() || "https://preview.gwenda-blue.pages.dev"
      : env.SITE_URL?.trim() || "https://gwenda.co.uk");
  const requireHome = deps.requireHome ?? siteId !== "preview";
  const shouldAlert = deps.alert ?? siteId === "production";
  const probe = await (deps.probe ?? probeSite)(siteUrl, fetch, { requireHome });
  const previous = await readState(env, siteId);
  const interpreted = interpretProbe(probe, previous.healthEndpointSeen);
  const now = deps.now ?? Date.now();
  const { state, alert } = nextHealthState(
    previous,
    now,
    interpreted.ok,
    interpreted.healthEndpointSeen,
  );
  const stored: HealthState = {
    ...state,
    lastCheckedAt: now,
    lastError: interpreted.ok ? null : lastErrorFromProbe(probe),
    lastProbe: probe,
  };
  await env.HEALTH_STATE.put(stateKeyFor(siteId), JSON.stringify(stored));

  if (alert && shouldAlert) {
    const send = deps.sendAlert ?? sendHealthAlert;
    const mailed = await send(env, alert, probe, siteUrl);
    if (!mailed.ok) {
      console.error(
        JSON.stringify({
          event: "site_health_alert_failed",
          site: siteId,
          alert,
          error: mailed.error || "unknown",
        }),
      );
    }
  }

  console.log(
    JSON.stringify({
      event: "site_health_check",
      site: siteId,
      ok: interpreted.ok,
      alert: shouldAlert ? alert : null,
      consecutiveFails: stored.consecutiveFails,
      down: stored.down,
      healthEndpointSeen: stored.healthEndpointSeen,
      checks: probe.checks,
    }),
  );

  return { ok: interpreted.ok, alert: shouldAlert ? alert : null, probe };
}

export async function runAllHealthChecks(
  env: Env,
  deps: {
    probe?: typeof probeSite;
    sendAlert?: typeof sendHealthAlert;
    now?: number;
  } = {},
): Promise<void> {
  for (const site of monitoredSites(env)) {
    await runHealthCheck(env, {
      ...deps,
      siteId: site.id,
      siteUrl: site.url,
      requireHome: site.requireHome,
      alert: site.alert,
    });
  }
}

export async function statusPayload(env: Env): Promise<Record<string, unknown>> {
  const sites: Record<string, unknown> = {};
  for (const site of monitoredSites(env)) {
    const state = await readState(env, site.id);
    sites[site.id] = {
      id: site.id,
      url: site.url,
      ok: !state.down,
      down: state.down,
      consecutiveFails: state.consecutiveFails,
      lastCheckedAt: state.lastCheckedAt,
      lastError: state.lastError,
      lastProbe: state.lastProbe,
      healthEndpointSeen: state.healthEndpointSeen,
    };
  }
  return {
    ok: true,
    service: "gwenda-site-health",
    sites,
  };
}

function json(body: Record<string, unknown>, status = 200): Response {
  return Response.json(body, { status });
}

export function isStatusAuthorized(request: Request, env: Env): boolean {
  const token = env.HEALTH_STATUS_TOKEN?.trim();
  if (!token) return true;
  const header = request.headers.get("Authorization") || "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  return Boolean(bearer && bearer === token);
}

export default {
  async scheduled(
    _controller: ScheduledController,
    env: Env,
    _ctx: ExecutionContext,
  ): Promise<void> {
    await runAllHealthChecks(env);
  },

  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/health") {
      // emailConfigured is the deploy smoke check: alerts can go out.
      return json({
        ok: true,
        service: "gwenda-site-health",
        emailConfigured: isGmailConfigured(env),
      });
    }

    if (request.method === "GET" && url.pathname === "/status") {
      if (!isStatusAuthorized(request, env)) {
        return json({ error: "Unauthorized" }, 401);
      }
      return json(await statusPayload(env));
    }

    if (request.method === "GET" && url.pathname === "/") {
      return json({
        ok: true,
        service: "gwenda-site-health",
        cron: "*/5 * * * *",
        sites: monitoredSites(env).map((site) => ({
          id: site.id,
          url: site.url,
        })),
        health: "GET /health",
        status: "GET /status",
      });
    }

    return json({ error: "Not found" }, 404);
  },
};
