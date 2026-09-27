import {
  buildAuthCookie,
  clearOauthStateCookie,
  createSessionToken,
  isSecureOrigin,
  OAUTH_STATE_COOKIE,
  opsUserForbiddenResponse,
  parseCookies,
  relativeRedirect,
  requestOrigin,
  resolveAuth,
  safeRedirectPath,
  verifyOauthStateToken,
} from "../../../src/access/server/auth.js";
import {
  exchangeGoogleCode,
  googleEmailFromTokens,
  parseOauthStateParam,
} from "../../../src/access/server/google-oauth.js";
import { opsEnv } from "../../../src/platform/ops-env.js";
import { allowedReturnTo, sessionCookieDomain } from "../../../src/access/server/preview-signin.js";
import { isOpsUser } from "../../../src/users/server/user-store.js";

/** Google OAuth callback: exchange code, check Users, set session. */
export async function onRequestGet(context) {
  const env = await opsEnv(context);
  const auth = resolveAuth(env);
  const secure = isSecureOrigin(requestOrigin(context.request));
  const clearOauth = clearOauthStateCookie({ secure });

  if (auth.kind !== "google") {
    return withClear(
      new Response("Google OAuth is not configured.", { status: 503 }),
      clearOauth,
    );
  }

  const url = new URL(context.request.url);
  const errorParam = url.searchParams.get("error");
  if (errorParam) {
    return withClear(
      relativeRedirect(`/gate/?error=${encodeURIComponent("Google sign-in was cancelled.")}`),
      clearOauth,
    );
  }

  const code = url.searchParams.get("code") || "";
  const { state: returnedState, next } = parseOauthStateParam(
    url.searchParams.get("state"),
  );
  const cookies = parseCookies(context.request.headers.get("Cookie"));
  const oauth = await verifyOauthStateToken(
    auth.sessionSecret,
    cookies[OAUTH_STATE_COOKIE],
  );
  if (!code || !oauth || oauth.state !== returnedState) {
    return withClear(
      relativeRedirect(
        `/gate/?error=${encodeURIComponent("Sign-in expired. Try again.")}`,
      ),
      clearOauth,
    );
  }

  try {
    const tokens = await exchangeGoogleCode(env, context.request, {
      code,
      codeVerifier: oauth.codeVerifier,
    });
    const email = await googleEmailFromTokens(tokens);
    if (!email) {
      return withClear(
        relativeRedirect(
          `/gate/?error=${encodeURIComponent("Google did not return an email.")}`,
        ),
        clearOauth,
      );
    }

    const allowed = await isOpsUser(env, email);
    if (!allowed) {
      return withClear(opsUserForbiddenResponse(), clearOauth);
    }

    const session = await createSessionToken(auth.sessionSecret, email);
    // Signed in for a dev branch preview: the dev session cookie is shared
    // with previews, so send the user straight back to it.
    const returnTo = allowedReturnTo(env, context.request, oauth.returnTo);
    const response = relativeRedirect(`${returnTo}${safeRedirectPath(next)}`);
    const domain = sessionCookieDomain(env, context.request);
    response.headers.append("Set-Cookie", buildAuthCookie(session, { secure, domain }));
    response.headers.append("Set-Cookie", clearOauth);
    return response;
  } catch (error) {
    const message =
      typeof error?.message === "string"
        ? error.message
        : "Google sign-in failed.";
    return withClear(
      relativeRedirect(`/gate/?error=${encodeURIComponent(message)}`),
      clearOauth,
    );
  }
}

function withClear(response, clearOauth) {
  response.headers.append("Set-Cookie", clearOauth);
  return response;
}
