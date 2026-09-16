/**
 * Protects the ops Pages project.
 * Google OAuth (local + production); optional OPS_PASSWORD bypass.
 */
import {
  authMisconfiguredResponse,
  buildAuthCookie,
  createPasswordToken,
  gateRedirectPath,
  isProtectedApiPath,
  isPublicPath,
  isRequestAuthed,
  isSecureOrigin,
  matchesSecret,
  opsUserForbiddenResponse,
  relativeRedirect,
  requestOrigin,
  resolveAuth,
  resolveSessionEmail,
  safeRedirectPath,
  signInRequiredResponse,
} from "./_lib/auth.js";
import { attachLogger, serializeError } from "./_lib/log.js";
import { isSpaDocumentPath } from "./_lib/spa-path.js";
import { isOpsUser } from "./_lib/user-store.js";

export async function onRequest(context) {
  const log = attachLogger(context);
  try {
    return await handleRequest(context);
  } catch (error) {
    log.error("request.unhandled", { err: serializeError(error) });
    throw error;
  }
}

async function handleRequest(context) {
  const auth = resolveAuth(context.env);
  if (auth.kind === "misconfigured") return authMisconfiguredResponse();

  const url = new URL(context.request.url);
  const bypassKey = context.env.OPS_BYPASS_KEY;
  const accessParam = url.searchParams.get("access");

  const authed = await isRequestAuthed(auth, context.request);

  if (
    auth.password &&
    bypassKey &&
    accessParam &&
    matchesSecret(accessParam, bypassKey)
  ) {
    const clean = new URL(url);
    clean.searchParams.delete("access");
    const headers = { Location: clean.pathname + clean.search };
    if (!authed) {
      headers["Set-Cookie"] = buildAuthCookie(
        await createPasswordToken(auth.password),
        { secure: isSecureOrigin(requestOrigin(context.request)) },
      );
    }
    return new Response(null, { status: 302, headers });
  }

  if (isPublicPath(url.pathname)) {
    if ((url.pathname === "/gate" || url.pathname === "/gate/") && authed) {
      if (auth.kind === "google") {
        const allowed = await isOpsUser(
          context.env,
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
      const allowed = await isOpsUser(context.env, email);
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
    return assets.fetch(new Request(url.toString(), context.request));
  }
  return context.next();
}
