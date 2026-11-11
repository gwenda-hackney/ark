import { handleDeploy, handlePromote, handleStatus } from "./handler";
import { handleCompare, handleDevCopy } from "./tools";
import type { Env } from "./types";
import { captureConsoleIntegration, withMonitor, withSentry } from "@sentry/cloudflare";
import { sentryOptions } from "../../../shared/sentry.js";

const ALLOWED_ORIGINS = new Set([
  "https://gwenda.sanity.studio",
  "http://localhost:3333",
]);

function corsHeaders(request: Request): HeadersInit {
  const origin = request.headers.get("Origin");
  if (!origin || !ALLOWED_ORIGINS.has(origin)) {
    return {};
  }

  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "Authorization, Content-Type, X-Deploy-Secret",
    Vary: "Origin",
  };
}

function jsonResponse(
  request: Request,
  body: Record<string, unknown>,
  status = 200,
): Response {
  return Response.json(body, {
    status,
    headers: corsHeaders(request),
  });
}

function serviceInfo(request: Request): Response {
  return jsonResponse(request, {
    ok: true,
    service: "gwenda-site-deploy-webhook",
    deploy: "POST /deploy",
    promote: "POST /promote",
    status: "GET /status?run_id=",
    compare: "GET /compare?base=&head=",
    devCopy: "POST /dev-copy",
    health: "GET /health",
  });
}

/**
 * Sentry cron monitors for the ticks below. One failed tick is normal (ops can
 * run over the free plan's 10 ms CPU, #235), so it takes 6 in a row, half an
 * hour without website updates starting on their own, to open an issue, and
 * one good tick closes it. Sentry creates the monitors from this config.
 */
const TICK_MONITOR: Parameters<typeof withMonitor>[2] = {
  schedule: { type: "crontab", value: "*/5 * * * *" },
  timezone: "Etc/UTC",
  checkinMargin: 2,
  maxRuntime: 2,
  failureIssueThreshold: 6,
  recoveryThreshold: 1,
};

/**
 * Cron: let ops start any website update that is due. Ops holds the rules.
 * Each ops checks its own env's secret, so dev ops gets the dev one. A failed
 * tick rejects, which its cron monitor records; it isn't an error by itself.
 */
export async function runOpsTick(
  env: Env,
  opsUrl = env.OPS_URL,
  secret = env.DEPLOY_WEBHOOK_SECRET,
): Promise<Response | null> {
  if (!opsUrl || !secret) return null;
  const response = await fetch(`${opsUrl.replace(/\/$/, "")}/api/web/tick`, {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}` },
  });
  if (!response.ok) {
    const message = `ops tick failed for ${opsUrl} (${response.status}): ${await response.text()}`;
    console.warn(message);
    throw new Error(message);
  }
  return response;
}

// Errors, including console.error, go to Sentry (#35). Workers run in production only.
export default withSentry(
  (env: Env) => ({
    ...sentryOptions(
      env as unknown as Record<string, unknown>,
      "deploy-webhook",
      "production",
    ),
    integrations: [captureConsoleIntegration({ levels: ["error"] })],
  }),
  {
    async scheduled(
      _controller: ScheduledController,
      env: Env,
      _ctx: ExecutionContext,
    ): Promise<void> {
      // Prod ops and dev ops each run their own website's schedule. Awaited,
      // not waitUntil, so the check-ins are sent before Sentry flushes.
      await Promise.allSettled([
        withMonitor("ops-tick", () => runOpsTick(env), TICK_MONITOR),
        withMonitor(
          "ops-tick-dev",
          () =>
            runOpsTick(
              env,
              env.OPS_DEV_URL,
              env.DEPLOY_WEBHOOK_SECRET_DEV || env.DEPLOY_WEBHOOK_SECRET,
            ),
          TICK_MONITOR,
        ),
      ]);
    },

    async fetch(request: Request, env: Env): Promise<Response> {
      if (request.method === "OPTIONS") {
        return new Response(null, {
          status: 204,
          headers: corsHeaders(request),
        });
      }

      const url = new URL(request.url);

      try {
        if (request.method === "GET" && url.pathname === "/health") {
          return jsonResponse(request, {
            ok: true,
            service: "gwenda-site-deploy-webhook",
          });
        }

        if (
          request.method === "GET" &&
          (url.pathname === "/" || url.pathname === "/deploy")
        ) {
          return serviceInfo(request);
        }

        if (request.method === "POST" && url.pathname === "/deploy") {
          const result = await handleDeploy(request, env);
          return jsonResponse(request, result.body, result.status);
        }

        if (request.method === "POST" && url.pathname === "/promote") {
          const result = await handlePromote(request, env);
          return jsonResponse(request, result.body, result.status);
        }

        if (request.method === "GET" && url.pathname === "/compare") {
          const result = await handleCompare(request, env);
          return jsonResponse(request, result.body, result.status);
        }

        if (
          request.method === "POST" &&
          (url.pathname === "/dev-copy" || url.pathname === "/baserow-copy")
        ) {
          const result = await handleDevCopy(request, env);
          return jsonResponse(request, result.body, result.status);
        }

        if (request.method === "GET" && url.pathname === "/status") {
          const result = await handleStatus(request, env);
          return jsonResponse(request, result.body, result.status);
        }

        return jsonResponse(request, { error: "Not found" }, 404);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unexpected worker error";
        console.error("site-deploy-webhook error:", message);
        return jsonResponse(request, { error: message }, 502);
      }
    },
  } satisfies ExportedHandler<Env>,
);
