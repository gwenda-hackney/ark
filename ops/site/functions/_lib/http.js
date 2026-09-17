/** JSON helpers for Cloudflare Pages Functions. */
import { attachLogger, serializeError } from "./log.js";
import { opsEnv } from "./ops-env.js";

export function jsonResponse(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...extraHeaders },
  });
}

export function withApiHandler(handler) {
  return async (context) => {
    const started = Date.now();
    const log = attachLogger(context);
    try {
      const env = await opsEnv(context);
      const response = await handler({ ...context, env });
      log.info("api.request", {
        status: response.status,
        ms: Date.now() - started,
      });
      return response;
    } catch (error) {
      const status =
        typeof error?.status === "number" && error.status >= 400
          ? error.status
          : 500;
      log.error("api.error", {
        status,
        ms: Date.now() - started,
        err: serializeError(error),
      });
      const message =
        status < 500 && typeof error?.message === "string"
          ? error.message
          : "Something went wrong. Please try again.";
      return jsonResponse({ error: message }, status);
    }
  };
}

export async function readJsonBody(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
