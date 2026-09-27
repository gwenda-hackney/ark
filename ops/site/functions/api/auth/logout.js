import {
  clearAuthCookie,
  gateRedirectPath,
  isSecureOrigin,
  relativeRedirect,
  requestOrigin,
} from "../../_lib/auth.js";
import { opsEnv } from "../../_lib/ops-env.js";
import { sessionCookieDomain } from "../../_lib/preview-signin.js";

export async function onRequestGet(context) {
  const secure = isSecureOrigin(requestOrigin(context.request));
  const response = relativeRedirect(gateRedirectPath("/"));
  response.headers.append("Set-Cookie", clearAuthCookie({ secure }));
  // On dev the session is shared across gwenda-ops-dev.pages.dev: clear that one too.
  const domain = sessionCookieDomain(await opsEnv(context), context.request);
  if (domain) response.headers.append("Set-Cookie", clearAuthCookie({ secure, domain }));
  return response;
}
