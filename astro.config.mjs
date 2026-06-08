import { defineConfig, envField } from "astro/config";
import { loadEnv } from "vite";
import { devSiteGate } from "./scripts/dev-site-gate.js";
import { subscribeEmail } from "./functions/_lib/subscribe.js";

const env = loadEnv(process.env.NODE_ENV ?? "development", process.cwd(), "");
const sitePassword = env.SITE_PASSWORD;
const gatePlugin = devSiteGate(sitePassword);

/** Dev-only stub for /api/subscribe — production uses functions/api/subscribe.js */
function devSubscribeApi() {
  return {
    name: "dev-subscribe-api",
    configureServer(server) {
      server.middlewares.use("/api/subscribe", (req, res, next) => {
        if (req.method !== "POST") {
          next();
          return;
        }

        let body = "";
        req.on("data", (chunk) => {
          body += chunk;
        });
        req.on("end", async () => {
          try {
            const { email, tag } = JSON.parse(body);
            const result = await subscribeEmail({
              email,
              tag,
              env: {
                BUTTONDOWN_API_KEY: env.BUTTONDOWN_API_KEY,
                PUBLIC_BUTTONDOWN_USERNAME: env.PUBLIC_BUTTONDOWN_USERNAME,
                BUTTONDOWN_BYPASS_FIREWALL: "true",
              },
            });

            res.statusCode = result.status;
            res.setHeader("Content-Type", "application/json");
            res.end(
              JSON.stringify(result.ok ? { ok: true } : { error: result.error }),
            );
          } catch {
            res.statusCode = 400;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: "Invalid request." }));
          }
        });
      });
    },
  };
}

export default defineConfig({
  output: "static",
  env: {
    schema: {
      SITE_PASSWORD: envField.string({
        context: "server",
        access: "secret",
        optional: true,
      }),
      PUBLIC_IS_STAGING: envField.string({
        context: "client",
        access: "public",
        optional: true,
        default: "false",
      }),
    },
  },
  image: {
    service: {
      entrypoint: "astro/assets/services/sharp",
    },
  },
  vite: {
    plugins: [devSubscribeApi(), ...(gatePlugin ? [gatePlugin] : [])],
  },
});
