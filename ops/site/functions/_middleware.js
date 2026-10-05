/**
 * Protects the ops Pages project.
 * Google OAuth (local + production); optional OPS_LOCAL_ADMIN_PW.
 */
import {
  authMisconfiguredResponse,
  gateRedirectPath,
  isProtectedApiPath,
  isPublicPath,
  isRequestAuthed,
  opsUserForbiddenResponse,
  relativeRedirect,
  resolveAuth,
  resolveSessionEmail,
  safeRedirectPath,
  signInRequiredResponse,
} from "../src/access/server/auth.js";
import { sentryPagesPlugin } from "@sentry/cloudflare";
import { sentryOptions } from "../../../shared/sentry.js";
import { attachLogger } from "../src/platform/log.js";
import { opsEnv } from "../src/platform/ops-env.js";
import { isSpaDocumentPath } from "../src/app/spa-path.js";
import { isOpsUser } from "../src/users/server/user-store.js";
import { opsWriteFeatures } from "../src/platform/write-freeze-paths.js";
import { frozenWriteResponse, isWriteRequest } from "../../../shared/write-freeze.js";

// Sentry first, so it sees every error the request throws (#35).
export const onRequest = [
  sentryPagesPlugin((context) => sentryOptions(context.env, "ops")),
  protect,
];

// A thrown error reaches Sentry through its plugin, with the stack.
export async function protect(context) {
  attachLogger(context);
  const url = new URL(context.request.url);
  // While a feature's data moves to D1, its writes wait (#191). The tick runs
  // before sign-in checks, so this comes first.
  if (url.pathname.startsWith("/api/") && isWriteRequest(context.request)) {
    const refused = await frozenWriteResponse(context.env, opsWriteFeatures(url.pathname));
    if (refused) return refused;
  }
  const env = await opsEnv(context);
  const auth = resolveAuth(env);
  if (auth.kind === "misconfigured") return authMisconfiguredResponse();

  const authed = await isRequestAuthed(auth, context.request);

  if (isPublicPath(url.pathname)) {
    if ((url.pathname === "/gate" || url.pathname === "/gate/") && authed) {
      if (auth.kind === "google") {
        const allowed = await isOpsUser(
          env,
          await resolveSessionEmail(context.request, auth),
        );
        if (!allowed) return opsUserForbiddenResponse();
      }
      return relativeRedirect(safeRedirectPath(url.searchParams.get("next")));
    }
    return context.next();
  }

  if (auth.kind === "google" && authed) {
    const email = await resolveSessionEmail(context.request, auth);
    if (email) {
      const allowed = await isOpsUser(env, email);
      if (!allowed) {
        if (isProtectedApiPath(url.pathname)) {
          return opsUserForbiddenResponse({ json: true });
        }
        return opsUserForbiddenResponse();
      }
    }
  }

  if (authed) {
    if (isSpaDocumentPath(url.pathname)) return serveSpaIndex(context);
    return context.next();
  }

  if (isProtectedApiPath(url.pathname)) return signInRequiredResponse();
  return relativeRedirect(gateRedirectPath(url.pathname + url.search));
}

async function serveSpaIndex(context) {
  const url = new URL(context.request.url);
  url.pathname = "/index.html";
  url.search = "";
  url.hash = "";
  const assets = context.env?.ASSETS;
  if (assets && typeof assets.fetch === "function") {
    // Follow asset pretty-URL redirects server-side. Returning a 308 to `/`
    // for `/events` (and other shell paths) boots the SPA on home instead.
    let response = await assets.fetch(
      new Request(url.toString(), context.request),
    );
    for (
      let hop = 0;
      hop < 3 && response.status >= 300 && response.status < 400;
      hop += 1
    ) {
      const location = response.headers.get("Location");
      if (!location) break;
      const next = new URL(location, url);
      next.search = "";
      next.hash = "";
      response = await assets.fetch(
        new Request(next.toString(), context.request),
      );
    }
    if (!response.ok) return response;
    return new Response(response.body, {
      status: 200,
      headers: response.headers,
    });
  }
  return context.next();
}
