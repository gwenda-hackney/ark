import { defineConfig, envField } from "astro/config";
import { loadEnv } from "vite";
import { devSiteGate } from "./scripts/dev-site-gate.js";
import { subscribeEmail } from "./functions/_lib/subscribe.js";

const env = loadEnv(process.env.NODE_ENV ?? "development", process.cwd(), "");
const sitePassword = env.SITE_PASSWORD;
const gatePlugin = devSiteGate({
  password: sitePassword,
  bypassKey: env.GATE_BYPASS_KEY,
});

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
                BASEROW_API_KEY: env.BASEROW_API_KEY,
                BASEROW_TABLE_ID: env.BASEROW_TABLE_ID,
                BASEROW_API_URL: env.BASEROW_API_URL,
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
  site: "https://gwenda.co.uk",
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
      PUBLIC_BUILD_SHA: envField.string({
        context: "client",
        access: "public",
        optional: true,
        default: "",
      }),
      PUBLIC_BUILD_REF: envField.string({
        context: "client",
        access: "public",
        optional: true,
        default: "",
      }),
      PUBLIC_BUILD_TIME: envField.string({
        context: "client",
        access: "public",
        optional: true,
        default: "",
      }),
      PUBLIC_BUILD_VERSION: envField.string({
        context: "client",
        access: "public",
        optional: true,
        default: "",
      }),
      PUBLIC_OPENING_DATE: envField.string({
        context: "client",
        access: "public",
        optional: true,
        default: "2026-07-04",
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
