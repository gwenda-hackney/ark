import { handleWebhook } from "./handler";
import type { ClickUpWebhookPayload, Env } from "./types";

function webhookInfo(): Response {
  return Response.json({
    ok: true,
    service: "gwenda-recipe-cost-webhook",
    webhook: "POST /webhook",
    health: "GET /health",
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/health") {
      return Response.json({ ok: true, service: "gwenda-recipe-cost-webhook" });
    }

    if (
      request.method === "GET" &&
      (url.pathname === "/" || url.pathname === "/webhook")
    ) {
      return webhookInfo();
    }

    if (request.method !== "POST" || url.pathname !== "/webhook") {
      return Response.json({ error: "Not found" }, { status: 404 });
    }

    let payload: ClickUpWebhookPayload;
    try {
      payload = await request.json();
    } catch {
      return Response.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    try {
      const result = await handleWebhook(payload, env);
      return Response.json(result.body, { status: result.status });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return Response.json({ error: message }, { status: 502 });
    }
  },
};
