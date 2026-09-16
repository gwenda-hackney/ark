import {
  clearAuthCookie,
  gateRedirectPath,
  isSecureOrigin,
  relativeRedirect,
  requestOrigin,
} from "../../_lib/auth.js";

export async function onRequestGet(context) {
  const secure = isSecureOrigin(requestOrigin(context.request));
  const response = relativeRedirect(gateRedirectPath("/"));
  response.headers.set("Set-Cookie", clearAuthCookie({ secure }));
  return response;
}
