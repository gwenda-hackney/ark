/**
 * Protects the ops Pages project.
 * Cloudflare Access in production; OPS_PASSWORD or local Access sim (Users table).
 */
import {
  accessRequiredResponse,
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
  resolveAccessEmail,
  resolveAuth,
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
  const url = new URL(context.request.url);
  const bypassKey = context.env.OPS_BYPASS_KEY;
  const accessParam = url.searchParams.get("access");

  const authed = await isRequestAuthed(auth, context.request);

  if (
    auth.kind === "password" &&
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
      if (auth.kind === "access") {
        const allowed = await isOpsUser(
          context.env,
          await resolveAccessEmail(context.request, auth),
        );
        if (!allowed) return opsUserForbiddenResponse();
      }
      return relativeRedirect(safeRedirectPath(url.searchParams.get("next")));
    }
    return context.next();
  }

  if (auth.kind === "access" && authed) {
    const allowed = await isOpsUser(
      context.env,
      await resolveAccessEmail(context.request, auth),
    );
    if (!allowed) {
      if (isProtectedApiPath(url.pathname)) {
        return opsUserForbiddenResponse({ json: true });
      }
      return opsUserForbiddenResponse();
    }
  }

  if (authed) {
    if (isSpaDocumentPath(url.pathname)) return serveSpaIndex(context);
    return context.next();
  }

  if (isProtectedApiPath(url.pathname)) return signInRequiredResponse();

  // Local Access sim uses the gate; production Access never reaches here without a header.
  if (auth.kind === "access" && auth.local) {
    return relativeRedirect(gateRedirectPath(url.pathname + url.search));
  }
  if (auth.kind === "access") return accessRequiredResponse();
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
