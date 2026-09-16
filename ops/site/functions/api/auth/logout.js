import {
  clearAuthCookie,
  gateRedirectPath,
  isSecureOrigin,
  relativeRedirect,
  requestOrigin,
  resolveAuth,
  accessLogoutPath,
} from "../../_lib/auth.js";

export async function onRequestGet(context) {
  const auth = resolveAuth(context.env);
  const origin = requestOrigin(context.request);
  const secure = isSecureOrigin(origin);
  // Local Access sim and password gate both clear the cookie and return to /gate/.
  const location =
    auth.kind === "access" && !auth.local
      ? accessLogoutPath()
      : gateRedirectPath("/");

  const response = relativeRedirect(location);
  response.headers.set("Set-Cookie", clearAuthCookie({ secure }));
  return response;
}
