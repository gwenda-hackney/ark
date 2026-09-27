import {
  buildOauthStateCookie,
  createOauthStateToken,
  isSecureOrigin,
  relativeRedirect,
  requestOrigin,
  resolveAuth,
  safeRedirectPath,
} from "../../../src/features/access/server/auth.js";
import {
  buildGoogleAuthorizeUrl,
  randomUrlSafe,
} from "../../../src/features/access/server/google-oauth.js";
import { opsEnv } from "../../../src/platform/ops-env.js";
import { allowedReturnTo, DEV_OPS_ORIGIN, devPreviewOrigin } from "../../../src/features/access/server/preview-signin.js";

/** Start Google OAuth (PKCE). */
export async function onRequestGet(context) {
  const env = await opsEnv(context);
  const auth = resolveAuth(env);
  if (auth.kind !== "google") {
    return new Response("Google OAuth is not configured.", { status: 503 });
  }

  const url = new URL(context.request.url);
  const next = safeRedirectPath(url.searchParams.get("next"));

  // A dev branch preview can't be a Google redirect URI: sign in on the main
  // dev host, which hands the session back (preview-signin.js).
  const previewOrigin = devPreviewOrigin(env, context.request);
  if (previewOrigin) {
    const login = new URL("/api/auth/login", DEV_OPS_ORIGIN);
    login.searchParams.set("next", next);
    login.searchParams.set("return_to", previewOrigin);
    return relativeRedirect(login.toString());
  }
  const returnTo = allowedReturnTo(env, context.request, url.searchParams.get("return_to"));

  const state = randomUrlSafe(16);
  const codeVerifier = randomUrlSafe(32);
  const authorizeUrl = await buildGoogleAuthorizeUrl(env, context.request, {
    state,
    codeVerifier,
    next,
  });
  const secure = isSecureOrigin(requestOrigin(context.request));
  const oauthCookie = await createOauthStateToken(
    auth.sessionSecret,
    state,
    codeVerifier,
    returnTo,
  );

  const response = relativeRedirect(authorizeUrl);
  response.headers.set(
    "Set-Cookie",
    buildOauthStateCookie(oauthCookie, { secure }),
  );
  return response;
}
