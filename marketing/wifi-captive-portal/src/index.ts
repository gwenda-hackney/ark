import { handlePortalRequest } from "./handler.js";
import type { Env } from "./types.js";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return await handlePortalRequest(request, env);
    } catch (err) {
      console.error(
        "[wifi-captive-portal]",
        err instanceof Error ? err.stack || err.message : err,
      );
      return new Response("Something went wrong. Try again?", {
        status: 500,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }
  },
};
