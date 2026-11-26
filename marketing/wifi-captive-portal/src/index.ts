import { handlePortalRequest } from "./handler.js";
import { runPortalAddressCheck } from "./portal-addresses.js";
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
    // Every 15 minutes: the router keeps up with Cloudflare's addresses for the portal (#388).
    async scheduled(_controller: ScheduledController, env: Env): Promise<void> {
      await runPortalAddressCheck(env);
    },

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
