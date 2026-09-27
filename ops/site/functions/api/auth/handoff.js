import {
  buildAuthCookie,
  createSessionToken,
  opsUserForbiddenResponse,
  relativeRedirect,
  resolveAuth,
  safeRedirectPath,
  verifyHandoffToken,
} from "../../_lib/auth.js";
import { opsEnv } from "../../_lib/ops-env.js";
import { devPreviewOrigin } from "../../_lib/preview-signin.js";
import { isOpsUser } from "../../_lib/user-store.js";

/**
 * Dev branch previews only: take the one-minute token from the main dev host
 * (api/auth/callback.js) and start this preview's own session. Anywhere else
 * this route doesn't exist.
 */
export async function onRequestGet(context) {
  const env = await opsEnv(context);
  const origin = devPreviewOrigin(env, context.request);
  const auth = resolveAuth(env);
  if (!origin || auth.kind !== "google") {
    return new Response("Not found.", { status: 404 });
  }

  const url = new URL(context.request.url);
  const next = safeRedirectPath(url.searchParams.get("next"));
  const email = await verifyHandoffToken(auth.sessionSecret, url.searchParams.get("token"), origin);
  if (!email) {
    return relativeRedirect(`/gate/?error=${encodeURIComponent("Sign-in expired. Try again.")}`);
  }
  // Checked again here: the Users list may have changed since the token.
  if (!(await isOpsUser(env, email))) return opsUserForbiddenResponse();

  const session = await createSessionToken(auth.sessionSecret, email);
  const response = relativeRedirect(next);
  response.headers.append("Set-Cookie", buildAuthCookie(session, { secure: true }));
  return response;
}
