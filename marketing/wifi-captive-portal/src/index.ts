import { handlePortalRequest } from "./handler.js";
import type { Env } from "./types.js";
import { captureConsoleIntegration, withSentry } from "@sentry/cloudflare";
import { sentryOptions } from "../../../shared/sentry.js";

// Errors, including console.error, go to Sentry (#35). Workers run in production only.
export default withSentry(
  (env: Env) => ({
    ...sentryOptions(
      env as unknown as Record<string, unknown>,
      "wifi-portal",
      "production",
    ),
    integrations: [captureConsoleIntegration({ levels: ["error"] })],
  }),
  {
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
  } satisfies ExportedHandler<Env>,
);
