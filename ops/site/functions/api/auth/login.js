import {
  buildOauthStateCookie,
  createOauthStateToken,
  isSecureOrigin,
  relativeRedirect,
  requestOrigin,
  resolveAuth,
  safeRedirectPath,
} from "../../_lib/auth.js";
import {
  buildGoogleAuthorizeUrl,
  randomUrlSafe,
} from "../../_lib/google-oauth.js";
import { opsEnv } from "../../_lib/ops-env.js";

/** Start Google OAuth (PKCE). */
export async function onRequestGet(context) {
  const env = await opsEnv(context);
  const auth = resolveAuth(env);
  if (auth.kind !== "google") {
    return new Response("Google OAuth is not configured.", { status: 503 });
  }

  const url = new URL(context.request.url);
  const next = safeRedirectPath(url.searchParams.get("next"));
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
  );

  const response = relativeRedirect(authorizeUrl);
  response.headers.set(
    "Set-Cookie",
    buildOauthStateCookie(oauthCookie, { secure }),
  );
  return response;
}
