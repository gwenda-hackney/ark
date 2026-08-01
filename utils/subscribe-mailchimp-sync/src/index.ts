import { isAuthorized, syncUnsyncedSubscribers } from "./sync";
import type { Env } from "./types";

function json(body: Record<string, unknown>, status = 200): Response {
  return Response.json(body, { status });
}

export default {
  async scheduled(
    _controller: ScheduledController,
    env: Env,
    _ctx: ExecutionContext,
  ): Promise<void> {
    const summary = await syncUnsyncedSubscribers(env, { trigger: "cron" });
    console.log(
      JSON.stringify({
        event: "subscribe-mailchimp-sync",
        ...summary,
        results: summary.results.map((r) => ({
          rowId: r.rowId,
          status: r.status,
          detail: r.detail,
        })),
      }),
    );
    if (!summary.ok) {
      throw new Error(
        `Sync finished with ${summary.errors} error(s) of ${summary.scanned} scanned`,
      );
    }
  },

  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/health") {
      return json({ ok: true, service: "gwenda-subscribe-mailchimp-sync" });
    }

    if (request.method === "GET" && url.pathname === "/") {
      return json({
        ok: true,
        service: "gwenda-subscribe-mailchimp-sync",
        cron: "0 * * * *",
        sync: "POST / with Authorization: Bearer $SYNC_SECRET",
        health: "GET /health",
      });
    }

    if (request.method === "POST" && url.pathname === "/") {
      if (!isAuthorized(request, env)) {
        return json({ error: "Unauthorized" }, 401);
      }

      try {
        const dryRun = url.searchParams.get("dryRun") === "true";
        const all = url.searchParams.get("all") === "true";
        const limitRaw = url.searchParams.get("limit");
        const limit = limitRaw ? Number(limitRaw) : undefined;
        const summary = await syncUnsyncedSubscribers(env, {
          dryRun,
          all,
          trigger: "manual",
          limit:
            limit !== undefined && Number.isFinite(limit) && limit > 0
              ? Math.floor(limit)
              : undefined,
        });
        return json(summary, summary.ok ? 200 : 207);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unexpected sync error";
        console.error("subscribe-mailchimp-sync error:", message);
        return json({ error: message }, 502);
      }
    }

    return json({ error: "Not found" }, 404);
  },
};
