import { defineConfig, envField } from "astro/config";
import { loadEnv } from "vite";
import { devSiteGate } from "./scripts/dev-site-gate.js";
import {
  issueSubscribeTokens,
  validateSubscribeAuth,
} from "./functions/_lib/subscribe-auth.js";
import { isSubscribeHoneypotTripped } from "./functions/_lib/subscribe-honeypot.js";
import { parseCookies } from "./functions/_lib/site-auth.js";
import { subscribeEmail } from "./functions/_lib/subscribe.js";
import { getInviteByToken, saveRsvpGuests } from "./functions/_lib/rsvp.js";
import { fetchPublishedEvents } from "./functions/_lib/sanity-events.js";
import {
  verifyEventAdminRequest,
} from "./functions/_lib/event-admin-auth.js";
import { fetchGuestsForEvent, summarizeGuests } from "./functions/_lib/event-guests.js";
import { fetchEventBySlug } from "./functions/_lib/sanity-event.js";
import { sendEventInvites } from "./functions/_lib/invite-send.js";

const env = loadEnv(process.env.NODE_ENV ?? "development", process.cwd(), "");
const sitePassword = env.SITE_PASSWORD;
const gatePlugin = devSiteGate({
  password: sitePassword,
  bypassKey: env.GATE_BYPASS_KEY,
});

const subscribeEnv = () => ({
  SUBSCRIBE_SECRET: env.SUBSCRIBE_SECRET,
  BASEROW_API_KEY: env.BASEROW_API_KEY,
  BASEROW_TABLE_ID: env.BASEROW_TABLE_ID,
  BASEROW_API_URL: env.BASEROW_API_URL,
});

const rsvpEnv = () => ({
  BASEROW_API_KEY: env.BASEROW_API_KEY,
  BASEROW_API_URL: env.BASEROW_API_URL,
  BASEROW_DATABASE_ID: env.BASEROW_DATABASE_ID,
  BASEROW_RSVP_TABLE_NAME: env.BASEROW_RSVP_TABLE_NAME,
  SITE_ENV: env.PUBLIC_IS_STAGING === "true" ? "staging" : env.SITE_ENV,
  SANITY_PROJECT_ID: env.SANITY_PROJECT_ID,
  SANITY_DATASET: env.SANITY_DATASET,
});

const adminEnv = () => ({
  ...rsvpEnv(),
  EVENT_ADMIN_SECRET: env.EVENT_ADMIN_SECRET,
  INVITE_BASE_URL: env.INVITE_BASE_URL,
  INVITE_IMAGE_URL: env.INVITE_IMAGE_URL,
  INVITE_EMAIL_SUBJECT: env.INVITE_EMAIL_SUBJECT,
  INVITE_EMAIL_BODY: env.INVITE_EMAIL_BODY,
  INVITE_INSTAGRAM_MESSAGE: env.INVITE_INSTAGRAM_MESSAGE,
  SMTP_HOST: env.SMTP_HOST,
  SMTP_PORT: env.SMTP_PORT,
  SMTP_USER: env.SMTP_USER,
  SMTP_PASSWORD: env.SMTP_PASSWORD,
  SMTP_FROM: env.SMTP_FROM,
  INSTAGRAM_ACCESS_TOKEN: env.INSTAGRAM_ACCESS_TOKEN,
  INSTAGRAM_BUSINESS_ACCOUNT_ID: env.INSTAGRAM_BUSINESS_ACCOUNT_ID,
});

function sendJson(res, status, data, extraHeaders = {}) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  for (const [key, value] of Object.entries(extraHeaders)) {
    res.setHeader(key, value);
  }
  res.end(JSON.stringify(data));
}

/** Dev-only stub for /api/subscribe — production uses functions/api/subscribe.js */
function devSubscribeApi() {
  return {
    name: "dev-subscribe-api",
    configureServer(server) {
      server.middlewares.use("/api/subscribe", (req, res, next) => {
        const runtimeEnv = subscribeEnv();

        if (req.method === "GET") {
          const issued = issueSubscribeTokens(runtimeEnv, { secure: false });
          if (issued.kind === "error") {
            sendJson(res, issued.status, { error: issued.error });
            return;
          }

          sendJson(
            res,
            200,
            { csrfToken: issued.csrfToken, secret: issued.secret },
            { "Set-Cookie": issued.setCookie },
          );
          return;
        }

        if (req.method !== "POST") {
          next();
          return;
        }

        const auth = validateSubscribeAuth({
          getHeader: (name) => req.headers[name.toLowerCase()],
          cookies: parseCookies(req.headers.cookie),
          env: runtimeEnv,
        });
        if (!auth.ok) {
          sendJson(res, auth.status, { error: auth.error });
          return;
        }

        let rawBody = "";
        req.on("data", (chunk) => {
          rawBody += chunk;
        });
        req.on("end", async () => {
          try {
            const payload = JSON.parse(rawBody);
            if (isSubscribeHoneypotTripped(payload)) {
              sendJson(res, 200, { ok: true });
              return;
            }

            const { email, tag } = payload;
            const result = await subscribeEmail({
              email,
              tag,
              env: runtimeEnv,
            });

            sendJson(
              res,
              result.status,
              result.ok ? { ok: true } : { error: result.error },
            );
          } catch {
            sendJson(res, 400, { error: "Invalid request." });
          }
        });
      });
    },
  };
}

/** Dev-only stub for /api/rsvp — production uses functions/api/rsvp.js */
function devRsvpApi() {
  return {
    name: "dev-rsvp-api",
    configureServer(server) {
      server.middlewares.use("/api/rsvp", async (req, res, next) => {
        const runtimeEnv = rsvpEnv();

        if (req.method === "GET") {
          const url = new URL(req.url ?? "", "http://localhost");
          const token = url.searchParams.get("token");
          const result = await getInviteByToken(runtimeEnv, token ?? "");
          sendJson(
            res,
            result.status,
            result.ok
              ? {
                  ok: true,
                  name: result.guest.name,
                  rsvpGuests: result.guest.rsvpGuests,
                  event: result.event,
                }
              : { error: result.error },
          );
          return;
        }

        if (req.method !== "POST") {
          next();
          return;
        }

        let rawBody = "";
        req.on("data", (chunk) => {
          rawBody += chunk;
        });
        req.on("end", async () => {
          try {
            const payload = JSON.parse(rawBody);
            const parsed =
              typeof payload.guests === "number"
                ? payload.guests
                : Number.parseInt(String(payload.guests), 10);
            const result = await saveRsvpGuests(runtimeEnv, payload.token, parsed);
            sendJson(
              res,
              result.status,
              result.ok
                ? {
                    ok: true,
                    name: result.guest.name,
                    rsvpGuests: result.guest.rsvpGuests,
                    event: result.event,
                  }
                : { error: result.error },
            );
          } catch {
            sendJson(res, 400, { error: "Invalid request." });
          }
        });
      });
    },
  };
}

/** Dev-only stub for /api/events */
function devEventsApi() {
  return {
    name: "dev-events-api",
    configureServer(server) {
      server.middlewares.use("/api/events", async (req, res, next) => {
        if (req.method !== "GET") {
          next();
          return;
        }
        const events = await fetchPublishedEvents(adminEnv());
        sendJson(res, 200, { ok: true, events });
      });
    },
  };
}

/** Dev-only stub for /api/event-admin/* */
function devEventAdminApi() {
  return {
    name: "dev-event-admin-api",
    configureServer(server) {
      server.middlewares.use("/api/event-admin", async (req, res, next) => {
        const runtimeEnv = adminEnv();
        const url = new URL(req.url ?? "", "http://localhost");
        const path = url.pathname.replace(/^\/api\/event-admin\/?/, "");

        if (
          !verifyEventAdminRequest(
            new Request("http://localhost", {
              headers: {
                Authorization: req.headers.authorization ?? req.headers.Authorization ?? "",
              },
            }),
            runtimeEnv,
          )
        ) {
          sendJson(res, 401, { error: "Unauthorized." });
          return;
        }

        if (path === "summary" && req.method === "GET") {
          const slug = url.searchParams.get("slug");
          if (!slug) {
            sendJson(res, 400, { error: "Missing slug." });
            return;
          }
          const [event, guestsResult] = await Promise.all([
            fetchEventBySlug(runtimeEnv, slug),
            fetchGuestsForEvent(runtimeEnv, slug),
          ]);
          if (!guestsResult.ok) {
            sendJson(res, guestsResult.status, { error: guestsResult.error });
            return;
          }
          sendJson(res, 200, {
            ok: true,
            slug,
            event,
            summary: summarizeGuests(guestsResult.guests),
          });
          return;
        }

        if (path === "guests" && req.method === "GET") {
          const slug = url.searchParams.get("slug");
          if (!slug) {
            sendJson(res, 400, { error: "Missing slug." });
            return;
          }
          const result = await fetchGuestsForEvent(runtimeEnv, slug);
          sendJson(
            res,
            result.ok ? 200 : result.status,
            result.ok ? { ok: true, slug, guests: result.guests } : { error: result.error },
          );
          return;
        }

        if (path === "send" && req.method === "POST") {
          let rawBody = "";
          req.on("data", (chunk) => {
            rawBody += chunk;
          });
          req.on("end", async () => {
            try {
              const payload = JSON.parse(rawBody);
              const slug = payload?.slug?.trim();
              if (!slug) {
                sendJson(res, 400, { error: "Missing slug." });
                return;
              }
              const result = await sendEventInvites(runtimeEnv, slug, {
                dryRun: Boolean(payload?.dryRun),
              });
              sendJson(
                res,
                result.ok ? 200 : result.status,
                result.ok ? result : { error: result.error },
              );
            } catch (error) {
              sendJson(res, 502, {
                error: error instanceof Error ? error.message : "Send failed.",
              });
            }
          });
          return;
        }

        next();
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
        default: "2026-08-01",
      }),
      PUBLIC_BOOKING_ENABLED_FROM: envField.string({
        context: "client",
        access: "public",
        optional: true,
        default: "",
      }),
      PUBLIC_INVITE_IMAGE_URL: envField.string({
        context: "client",
        access: "public",
        optional: true,
        default: "",
      }),
      SANITY_PROJECT_ID: envField.string({
        context: "server",
        access: "public",
        optional: true,
        default: "pn5yjro6",
      }),
      SANITY_DATASET: envField.string({
        context: "server",
        access: "public",
        optional: true,
        default: "development",
      }),
      SANITY_API_TOKEN: envField.string({
        context: "server",
        access: "secret",
        optional: true,
      }),
    },
  },
  image: {
    service: {
      entrypoint: "astro/assets/services/sharp",
    },
    remotePatterns: [
      {
        protocol: "https",
        hostname: "cdn.sanity.io",
        pathname: "/images/**",
      },
    ],
  },
  vite: {
    // Monorepo: shared secrets and Sanity token live in ark/.env
    envDir: "..",
    // Devcontainer / Cursor port forwards use non-localhost Host headers; Vite blocks those with 403.
    server: { allowedHosts: true },
    preview: { allowedHosts: true },
    plugins: [devSubscribeApi(), devRsvpApi(), devEventsApi(), devEventAdminApi(), ...(gatePlugin ? [gatePlugin] : [])],
  },
});
