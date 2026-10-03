import { defineConfig, envField } from "astro/config";
import { resolve } from "node:path";
import { loadEnv } from "vite";
import { devSiteGate } from "./scripts/dev-site-gate.js";
import { missingLocalSettings } from "../../shared/config.js";
import {
  issueSubscribeTokens,
  validateSubscribeAuth,
} from "./functions/_lib/subscribe-auth.js";
import { isSubscribeHoneypotTripped } from "./functions/_lib/subscribe-honeypot.js";
import { parseCookies } from "./functions/_lib/site-auth.js";
import { subscribeEmail } from "./functions/_lib/subscribe.js";
import { getEventRsvp, saveRsvpResponse } from "./functions/_lib/rsvp.js";
import { resolvePublicOrigin } from "./functions/_lib/public-origin.js";
import { readEventPasswordFromSearchParams } from "./functions/_lib/event-password.js";
import { pickPemValue } from "../../shared/env-file.js";

const env = loadEnv(
  process.env.NODE_ENV ?? "development",
  resolve(process.cwd(), ".."),
  "",
);
const sitePassword = env.SITE_PASSWORD;

// A developer's machine must set its local-only values (.env.example).
// Fail before serving, not on the first form email.
if (process.argv.includes("dev")) {
  const missing = missingLocalSettings(
    {
      ...env,
      ...process.env,
      SITE_ENV: process.env.SITE_ENV || env.SITE_ENV || "local",
    },
    { services: ["web"] },
  );
  if (missing.length) {
    throw new Error(
      `Set your git email (git config user.email you@example.com), or these in the repo .env:\n${missing
        .map((row) => `  ${row.env}=  (${row.hint}, for ${row.key})`)
        .join("\n")}`,
    );
  }
}

function localSanityPerspective() {
  const explicit =
    process.env.SANITY_PERSPECTIVE?.trim() || env.SANITY_PERSPECTIVE?.trim();
  if (explicit === "published" || explicit === "previewDrafts") return explicit;
  // Only the live site hides drafts; the preview and a dev server show them.
  const siteEnv = process.env.SITE_ENV || env.SITE_ENV;
  return siteEnv === "production" ? "published" : "previewDrafts";
}
const gatePlugin = devSiteGate({
  password: sitePassword,
  bypassKey: env.GATE_BYPASS_KEY,
});

const subscribeEnv = () => ({
  SUBSCRIBE_SECRET: process.env.SUBSCRIBE_SECRET || env.SUBSCRIBE_SECRET,
  BASEROW_API_KEY: process.env.BASEROW_API_KEY || env.BASEROW_API_KEY,
  BASEROW_API_URL: process.env.BASEROW_API_URL || env.BASEROW_API_URL,
  BASEROW_DATABASE_ID:
    process.env.BASEROW_DATABASE_ID || env.BASEROW_DATABASE_ID,
  BASEROW_SUBSCRIBE_TABLE_NAME:
    process.env.BASEROW_SUBSCRIBE_TABLE_NAME ||
    env.BASEROW_SUBSCRIBE_TABLE_NAME,
  // These run in the local dev server only: a developer's machine.
  SITE_ENV: process.env.SITE_ENV || env.SITE_ENV || "local",
});

const rsvpEnv = () => ({
  BASEROW_API_KEY: process.env.BASEROW_API_KEY || env.BASEROW_API_KEY,
  BASEROW_API_URL: process.env.BASEROW_API_URL || env.BASEROW_API_URL,
  BASEROW_DATABASE_ID:
    process.env.BASEROW_DATABASE_ID || env.BASEROW_DATABASE_ID,
  BASEROW_RSVP_TABLE_NAME:
    process.env.BASEROW_RSVP_TABLE_NAME || env.BASEROW_RSVP_TABLE_NAME,
  // These run in the local dev server only: a developer's machine.
  SITE_ENV: process.env.SITE_ENV || env.SITE_ENV || "local",
  TICKET_SECRET: process.env.TICKET_SECRET || env.TICKET_SECRET,
  SUBSCRIBE_SECRET: process.env.SUBSCRIBE_SECRET || env.SUBSCRIBE_SECRET,
  SANITY_PROJECT_ID: process.env.SANITY_PROJECT_ID || env.SANITY_PROJECT_ID,
  SANITY_DATASET:
    process.env.SANITY_DATASET || env.SANITY_DATASET || "production",
  SANITY_API_TOKEN: process.env.SANITY_API_TOKEN || env.SANITY_API_TOKEN,
  SANITY_PERSPECTIVE: localSanityPerspective(),
  INVITE_BASE_URL: process.env.INVITE_BASE_URL || env.INVITE_BASE_URL,
  INVITE_IMAGE_URL: process.env.INVITE_IMAGE_URL || env.INVITE_IMAGE_URL,
  APPLE_WALLET_PASS_TYPE_ID:
    process.env.APPLE_WALLET_PASS_TYPE_ID || env.APPLE_WALLET_PASS_TYPE_ID,
  APPLE_WALLET_TEAM_ID:
    process.env.APPLE_WALLET_TEAM_ID || env.APPLE_WALLET_TEAM_ID,
  APPLE_WALLET_SIGNER_CERT: pickPemValue(
    process.env.APPLE_WALLET_SIGNER_CERT,
    env.APPLE_WALLET_SIGNER_CERT,
  ),
  APPLE_WALLET_SIGNER_KEY: pickPemValue(
    process.env.APPLE_WALLET_SIGNER_KEY,
    env.APPLE_WALLET_SIGNER_KEY,
  ),
  APPLE_WALLET_WWDR_CERT: pickPemValue(
    process.env.APPLE_WALLET_WWDR_CERT,
    env.APPLE_WALLET_WWDR_CERT,
  ),
  APPLE_WALLET_SIGNER_KEY_PASSPHRASE:
    process.env.APPLE_WALLET_SIGNER_KEY_PASSPHRASE ||
    env.APPLE_WALLET_SIGNER_KEY_PASSPHRASE,
});

const devApiEnv = () => ({
  ...rsvpEnv(),
  INVITE_BASE_URL: env.INVITE_BASE_URL,
  INVITE_IMAGE_URL: env.INVITE_IMAGE_URL,
  BASEROW_OPS_API_KEY:
    process.env.BASEROW_OPS_API_KEY || env.BASEROW_OPS_API_KEY,
  BASEROW_API_URL: process.env.BASEROW_API_URL || env.BASEROW_API_URL,
});

function sendJson(res, status, data, extraHeaders = {}) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  for (const [key, value] of Object.entries(extraHeaders)) {
    res.setHeader(key, value);
  }
  res.end(JSON.stringify(data));
}

/**
 * A failing dev handler answers 500 instead of leaving the request hanging.
 * Server code loads per request (ssrLoadModule), so a broken file only
 * shows up here, not at startup.
 */
function caught(label, handler) {
  return async (req, res, next) => {
    try {
      await handler(req, res, next);
    } catch (error) {
      console.error(label, error);
      if (!res.headersSent) {
        sendJson(res, 500, { error: "Something went wrong. Try again?" });
      } else {
        res.end();
      }
    }
  };
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

/** Dev-only stub for /api/forms* — production uses functions/api/forms*.js */
function devFormsApi() {
  return {
    name: "dev-forms-api",
    configureServer(server) {
      const formsEnv = () => ({
        SUBSCRIBE_SECRET: process.env.SUBSCRIBE_SECRET || env.SUBSCRIBE_SECRET,
        SANITY_PROJECT_ID:
          process.env.SANITY_PROJECT_ID?.trim() ||
          env.SANITY_PROJECT_ID?.trim(),
        SANITY_DATASET:
          process.env.SANITY_DATASET?.trim() ||
          env.SANITY_DATASET?.trim() ||
          "production",
        SANITY_API_TOKEN:
          process.env.SANITY_API_TOKEN?.trim() || env.SANITY_API_TOKEN?.trim(),
        SANITY_PERSPECTIVE: localSanityPerspective(),
        BASEROW_API_KEY: process.env.BASEROW_API_KEY || env.BASEROW_API_KEY,
        BASEROW_API_URL: process.env.BASEROW_API_URL || env.BASEROW_API_URL,
        BASEROW_DATABASE_ID:
          process.env.BASEROW_DATABASE_ID || env.BASEROW_DATABASE_ID,
        BASEROW_FORM_SUBMISSIONS_TABLE_NAME:
          process.env.BASEROW_FORM_SUBMISSIONS_TABLE_NAME ||
          env.BASEROW_FORM_SUBMISSIONS_TABLE_NAME,
        BASEROW_CONFIG_API_KEY:
          process.env.BASEROW_CONFIG_API_KEY || env.BASEROW_CONFIG_API_KEY,
        FORMS_ADMIN_SECRET:
          process.env.FORMS_ADMIN_SECRET || env.FORMS_ADMIN_SECRET,
        // A developer's own inbox for form emails (repo .env); hosted
        // non-prod sites use the config setting (alerts@).
        FORMS_NOTIFY_EMAIL:
          process.env.FORMS_NOTIFY_EMAIL || env.FORMS_NOTIFY_EMAIL,
        GMAIL_SERVICE_ACCOUNT_JSON:
          process.env.GMAIL_SERVICE_ACCOUNT_JSON ||
          env.GMAIL_SERVICE_ACCOUNT_JSON,
        // A developer's machine: dev settings plus their own .env values.
        SITE_ENV: process.env.SITE_ENV || env.SITE_ENV || "local",
        INVITE_BASE_URL: process.env.INVITE_BASE_URL || env.INVITE_BASE_URL,
        SITE_URL: process.env.SITE_URL || env.SITE_URL,
      });

      async function pipeFunction(req, res, handler, urlPath) {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        const bodyBuf = Buffer.concat(chunks);
        const headers = new Headers();
        for (const [key, value] of Object.entries(req.headers)) {
          if (value == null) continue;
          if (Array.isArray(value)) {
            for (const item of value) headers.append(key, item);
          } else {
            headers.set(key, value);
          }
        }
        const origin = `http://${req.headers.host || "localhost:4321"}`;
        const request = new Request(new URL(urlPath, origin), {
          method: req.method,
          headers,
          body:
            req.method === "GET" || req.method === "HEAD"
              ? undefined
              : bodyBuf.length
                ? bodyBuf
                : undefined,
        });
        const response = await handler({
          request,
          env: formsEnv(),
        });
        res.statusCode = response.status;
        response.headers.forEach((value, key) => {
          res.setHeader(key, value);
        });
        const text = await response.text();
        res.end(text);
      }

      server.middlewares.use(async (req, res, next) => {
        const pathOnly = (req.url || "").split("?")[0];
        try {
          if (pathOnly === "/api/forms/verify" && req.method === "GET") {
            const qs = (req.url || "").includes("?")
              ? req.url.slice(req.url.indexOf("?"))
              : "";
            const mod = await server.ssrLoadModule(
              "/functions/api/forms/verify.js",
            );
            await pipeFunction(
              req,
              res,
              mod.onRequestGet,
              `/api/forms/verify${qs}`,
            );
            return;
          }
          if (pathOnly === "/api/forms/edit" && req.method === "GET") {
            const qs = (req.url || "").includes("?")
              ? req.url.slice(req.url.indexOf("?"))
              : "";
            const mod = await server.ssrLoadModule(
              "/functions/api/forms/edit.js",
            );
            await pipeFunction(
              req,
              res,
              mod.onRequestGet,
              `/api/forms/edit${qs}`,
            );
            return;
          }
          if (pathOnly === "/api/forms/resend" && req.method === "POST") {
            const mod = await server.ssrLoadModule(
              "/functions/api/forms/resend.js",
            );
            await pipeFunction(
              req,
              res,
              mod.onRequestPost,
              "/api/forms/resend",
            );
            return;
          }
          if (pathOnly === "/api/forms/admin/resend" && req.method === "POST") {
            const mod = await server.ssrLoadModule(
              "/functions/api/forms/admin/resend.js",
            );
            await pipeFunction(
              req,
              res,
              mod.onRequestPost,
              "/api/forms/admin/resend",
            );
            return;
          }
          if (pathOnly === "/api/forms" || pathOnly === "/api/forms/") {
            const mod = await server.ssrLoadModule(
              "/functions/api/forms/index.js",
            );
            if (req.method === "GET") {
              await pipeFunction(req, res, mod.onRequestGet, "/api/forms");
              return;
            }
            if (req.method === "POST") {
              await pipeFunction(req, res, mod.onRequestPost, "/api/forms");
              return;
            }
          }
        } catch (error) {
          console.error("dev forms api", error);
          sendJson(res, 500, { error: "Something went wrong. Try again?" });
          return;
        }
        next();
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
        const runtimeEnv = {
          ...rsvpEnv(),
          SANITY_API_TOKEN:
            process.env.SANITY_API_TOKEN?.trim() ||
            env.SANITY_API_TOKEN?.trim(),
          SANITY_DATASET:
            process.env.SANITY_DATASET?.trim() ||
            env.SANITY_DATASET?.trim() ||
            "production",
          SANITY_PROJECT_ID:
            process.env.SANITY_PROJECT_ID?.trim() ||
            env.SANITY_PROJECT_ID?.trim(),
        };

        if (req.method === "GET") {
          const url = new URL(req.url ?? "", "http://localhost");
          const result = await getEventRsvp(
            runtimeEnv,
            url.searchParams.get("slug"),
            readEventPasswordFromSearchParams(url.searchParams),
          );
          sendJson(
            res,
            result.status,
            result.ok
              ? { ok: true, event: result.event, source: result.source }
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
            const result = await saveRsvpResponse(runtimeEnv, {
              slug: payload.slug,
              token: payload.token,
              attending: payload.attending,
              name: payload.name,
              email: payload.email,
              guests: payload.guests,
              origin: resolvePublicOrigin(
                req.headers.host ? `http://${req.headers.host}` : undefined,
                runtimeEnv,
              ),
            });
            sendJson(
              res,
              result.status,
              result.ok
                ? {
                    ok: true,
                    attending: result.attending,
                    name: result.name ?? null,
                    rsvpGuests: result.rsvpGuests,
                    source: result.source,
                    event: result.event,
                    ticketUrl: result.ticketUrl ?? null,
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

/**
 * Dev-only stub for /api/ticket, /api/ticket/pass, /api/ticket/calendar —
 * production uses functions/api/ticket.js and functions/api/ticket/*.js.
 *
 * Each route gets its own server.middlewares.use() mount (rather than one
 * mount with path parsing) because Vite/connect strips the matched mount
 * path from req.url before calling the handler — a single "/api/ticket"
 * mount never sees "/pass" or "/calendar" in req.url.
 */
async function resolveTicketFromRequest(server, req) {
  const url = new URL(req.url ?? "", "http://localhost");
  const { resolveTicket } = await server.ssrLoadModule(
    "/functions/_lib/ticket.js",
  );
  return {
    url,
    result: await resolveTicket(rsvpEnv(), {
      slug: url.searchParams.get("slug"),
      guest: url.searchParams.get("guest"),
      token: url.searchParams.get("t"),
    }),
  };
}

function devTicketApi() {
  return {
    name: "dev-ticket-api",
    configureServer(server) {
      server.middlewares.use(
        "/api/ticket/pass",
        caught("dev ticket pass api", async (req, res, next) => {
          if (req.method !== "GET") return next();
          const { result } = await resolveTicketFromRequest(server, req);
          if (!result.ok) {
            sendJson(res, result.status, { error: result.error });
            return;
          }
          const { event, guest, ticketId } = result;
          const { buildAppleWalletPass, ticketAttachmentBaseName } =
            await server.ssrLoadModule("/functions/_lib/rsvp-tickets.js");
          const pass = await buildAppleWalletPass(rsvpEnv(), {
            ticketId,
            title: event.title,
            date: event.date,
            startTime: event.ticketStart,
            endTime: event.ticketEnd,
            venue: event.venue,
            guestName: guest.name,
            guests: guest.rsvpGuests,
            heroImageUrl: event.heroImageUrl,
          });
          if (!pass) {
            sendJson(res, 503, {
              error: "Apple Wallet isn't set up for this event yet.",
            });
            return;
          }
          res.statusCode = 200;
          res.setHeader("Content-Type", "application/vnd.apple.pkpass");
          res.setHeader(
            "Content-Disposition",
            `attachment; filename="${ticketAttachmentBaseName(event.slug)}.pkpass"`,
          );
          res.end(pass);
        }),
      );

      server.middlewares.use(
        "/api/ticket/calendar",
        caught("dev ticket calendar api", async (req, res, next) => {
          if (req.method !== "GET") return next();
          const { result } = await resolveTicketFromRequest(server, req);
          if (!result.ok) {
            sendJson(res, result.status, { error: result.error });
            return;
          }
          const { event, guest, ticketId } = result;
          const { buildCalendarTicket, ticketAttachmentBaseName } =
            await server.ssrLoadModule("/functions/_lib/rsvp-tickets.js");
          const ics = buildCalendarTicket({
            ticketId,
            title: event.title,
            date: event.date,
            startTime: event.ticketStart,
            endTime: event.ticketEnd,
            venue: event.venue,
            guestName: guest.name,
            guests: guest.rsvpGuests,
            description: event.description,
          });
          res.statusCode = 200;
          res.setHeader("Content-Type", "text/calendar; charset=utf-8");
          res.setHeader(
            "Content-Disposition",
            `attachment; filename="${ticketAttachmentBaseName(event.slug)}.ics"`,
          );
          res.end(ics);
        }),
      );

      server.middlewares.use(
        "/api/ticket",
        caught("dev ticket api", async (req, res, next) => {
          if (req.method !== "GET") return next();
          const { result } = await resolveTicketFromRequest(server, req);
          if (!result.ok) {
            sendJson(res, result.status, { error: result.error });
            return;
          }
          const { event, guest, ticketId } = result;
          const { publicEventFields } = await server.ssrLoadModule(
            "/functions/_lib/sanity-event.js",
          );
          sendJson(res, 200, {
            ok: true,
            event: publicEventFields(event),
            guest: { name: guest.name, guests: guest.rsvpGuests },
            ticketId,
          });
        }),
      );
    },
  };
}

/** Dev-only stub for /api/events */
function devEventsApi() {
  return {
    name: "dev-events-api",
    configureServer(server) {
      server.middlewares.use(
        "/api/events",
        caught("dev events api", async (req, res, next) => {
          if (req.method !== "GET") {
            next();
            return;
          }
          const url = new URL(req.url ?? "", "http://localhost");
          const { fetchPublishedEvents } = await server.ssrLoadModule(
            "/functions/_lib/sanity-events.js",
          );
          const { pageEventFeed } = await server.ssrLoadModule(
            "/functions/_lib/event-feed.js",
          );
          const events = await fetchPublishedEvents(devApiEnv());
          const page = pageEventFeed(events, {
            after: url.searchParams.get("after") || "",
            afterId: url.searchParams.get("afterId") || "",
            limit: url.searchParams.get("limit") || "",
          });
          sendJson(res, 200, {
            ok: true,
            events: page.events,
            next: page.next,
          });
        }),
      );
    },
  };
}

/** Dev-only stub for /api/whats-on and /api/whats-on/:series */
function devWhatsOnApi() {
  return {
    name: "dev-whats-on-api",
    configureServer(server) {
      server.middlewares.use(
        "/api/whats-on",
        caught("dev whats-on api", async (req, res, next) => {
          if (req.method !== "GET") {
            next();
            return;
          }
          const url = new URL(req.url ?? "/", "http://localhost");
          // Vite strips the /api/whats-on mount, so list is "/" and detail is "/:series".
          const path = url.pathname.replace(/^\/+/, "").trim();
          const { fetchPublishedCatalog } = await server.ssrLoadModule(
            "/functions/_lib/sanity-events.js",
          );
          const { buildPublicSchedule, buildSeriesDetail, buildWhatsOnHome } =
            await server.ssrLoadModule("/functions/_lib/event-series.js");
          const { occurrences, series: seriesRecords } =
            await fetchPublishedCatalog(devApiEnv());
          if (path === "schedule") {
            sendJson(res, 200, {
              ok: true,
              ...buildPublicSchedule(occurrences, { series: seriesRecords }),
            });
            return;
          }
          if (!path) {
            sendJson(res, 200, {
              ok: true,
              ...buildWhatsOnHome(occurrences, {
                after: url.searchParams.get("after") || "",
                afterId: url.searchParams.get("afterId") || "",
                limit: url.searchParams.get("limit") || "",
                series: seriesRecords,
              }),
            });
            return;
          }
          const seriesId = decodeURIComponent(path.split("/")[0] || "").trim();
          const detail = buildSeriesDetail(occurrences, seriesId, {
            after: url.searchParams.get("after") || "",
            afterId: url.searchParams.get("afterId") || "",
            limit: url.searchParams.get("limit") || "",
            series: seriesRecords,
          });
          if (!detail) {
            sendJson(res, 404, { error: "Series not found." });
            return;
          }
          sendJson(res, 200, { ok: true, series: detail });
        }),
      );
    },
  };
}

/** Series, night and ticket pages, as functions/whats-on/[[path]].js renders them. */
function devEventPages() {
  return {
    name: "dev-event-pages",
    configureServer(server) {
      server.middlewares.use(
        caught("dev event pages", async (req, res, next) => {
          const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
          if (!url.pathname.startsWith("/whats-on/")) {
            next();
            return;
          }
          const { renderEventPage, SERIES_SHELL } = await server.ssrLoadModule(
            "/functions/_lib/event-pages.js",
          );
          if (req.method !== "GET" || url.pathname.startsWith(SERIES_SHELL)) {
            next();
            return;
          }
          const response = await renderEventPage(
            devApiEnv(),
            url.pathname,
            async (path) =>
              (
                await fetch(new URL(path, url), {
                  headers: { cookie: req.headers.cookie || "" },
                })
              ).text(),
          );
          if (!response) {
            next();
            return;
          }
          res.statusCode = response.status;
          response.headers.forEach((value, key) => res.setHeader(key, value));
          res.end(await response.text());
        }),
      );
    },
  };
}

/** Dev-only stub for /api/featured-artist */
function devFeaturedArtistApi() {
  return {
    name: "dev-featured-artist-api",
    configureServer(server) {
      server.middlewares.use(
        "/api/featured-artist",
        caught("dev featured-artist api", async (req, res, next) => {
          if (req.method !== "GET") {
            next();
            return;
          }
          const { fetchFeaturedArtists } = await server.ssrLoadModule(
            "/src/lib/featured-artist.js",
          );
          const featured = await fetchFeaturedArtists(devApiEnv());
          const current = featured.current;
          sendJson(res, 200, {
            ok: true,
            artist: current
              ? {
                  name: current.name,
                  startMonth: current.startMonth || "",
                  endMonth: current.endMonth || "",
                }
              : null,
          });
        }),
      );
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
      PUBLIC_IS_PREVIEW: envField.string({
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
        default: "production",
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
    plugins: [
      devSubscribeApi(),
      devFormsApi(),
      devRsvpApi(),
      devTicketApi(),
      devEventsApi(),
      devWhatsOnApi(),
      devEventPages(),
      devFeaturedArtistApi(),
      ...(gatePlugin ? [gatePlugin] : []),
    ],
  },
});
