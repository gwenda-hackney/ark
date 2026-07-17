import { handleDeploy, handlePromote, handleStatus } from "./handler";
import type { Env } from "./types";

const ALLOWED_ORIGINS = new Set([
  "https://gwenda.sanity.studio",
  "https://gwenda-dev.sanity.studio",
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
    "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Deploy-Secret",
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
    health: "GET /health",
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }

    const url = new URL(request.url);

    try {
      if (request.method === "GET" && url.pathname === "/health") {
        return jsonResponse(request, { ok: true, service: "gwenda-site-deploy-webhook" });
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
};
