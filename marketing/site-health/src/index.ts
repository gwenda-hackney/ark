import { sendHealthAlert } from "./alert";
import {
  interpretProbe,
  nextHealthState,
  parseHealthState,
  probeSite,
  STATE_KEY,
} from "./health";
import type { Env, ProbeResult } from "./types";

export async function runHealthCheck(
  env: Env,
  deps: {
    probe?: typeof probeSite;
    sendAlert?: typeof sendHealthAlert;
    now?: number;
  } = {},
): Promise<{ ok: boolean; alert: string | null; probe: ProbeResult }> {
  const siteUrl = env.SITE_URL?.trim() || "https://gwenda.co.uk";
  const probe = await (deps.probe ?? probeSite)(siteUrl);
  const raw = await env.HEALTH_STATE.get(STATE_KEY);
  const previous = parseHealthState(raw);
  const interpreted = interpretProbe(probe, previous.healthEndpointSeen);
  const now = deps.now ?? Date.now();
  const { state, alert } = nextHealthState(
    previous,
    now,
    interpreted.ok,
    interpreted.healthEndpointSeen,
  );
  await env.HEALTH_STATE.put(STATE_KEY, JSON.stringify(state));

  if (alert) {
    const send = deps.sendAlert ?? sendHealthAlert;
    const mailed = await send(env, alert, probe);
    if (!mailed.ok) {
      console.error(
        JSON.stringify({
          event: "site_health_alert_failed",
          alert,
          error: mailed.error || "unknown",
        }),
      );
    }
  }

  console.log(
    JSON.stringify({
      event: "site_health_check",
      ok: interpreted.ok,
      alert,
      consecutiveFails: state.consecutiveFails,
      down: state.down,
      healthEndpointSeen: state.healthEndpointSeen,
      checks: probe.checks,
    }),
  );

  return { ok: interpreted.ok, alert, probe };
}

function json(body: Record<string, unknown>, status = 200): Response {
  return Response.json(body, { status });
}

export default {
  async scheduled(
    _controller: ScheduledController,
    env: Env,
    _ctx: ExecutionContext,
  ): Promise<void> {
    await runHealthCheck(env);
  },

  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/health") {
      return json({ ok: true, service: "gwenda-site-health" });
    }

    if (request.method === "GET" && url.pathname === "/") {
      return json({
        ok: true,
        service: "gwenda-site-health",
        cron: "*/5 * * * *",
        site: env.SITE_URL || "https://gwenda.co.uk",
        health: "GET /health",
      });
    }

    return json({ error: "Not found" }, 404);
  },
};
