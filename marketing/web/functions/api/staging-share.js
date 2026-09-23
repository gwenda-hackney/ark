/**
 * Authenticated staging helper: returns a share URL with ?access= for the
 * current path. Keeps GATE_BYPASS_KEY out of static HTML (crawlers can hit
 * public routes without the gate cookie).
 */
import {
  AUTH_COOKIE_NAME,
  buildGateShareUrl,
  gateMisconfiguredResponse,
  parseCookies,
  resolveGate,
  safeRedirectPath,
  verifyAuthToken,
} from "../_lib/site-auth.js";

export async function onRequestGet(context) {
  const gate = resolveGate(context.env);
  if (gate.kind === "misconfigured") return gateMisconfiguredResponse();
  if (gate.kind === "open") {
    return json({ error: "Share links are only for the gated staging site." }, 404);
  }

  const bypassKey = String(context.env.GATE_BYPASS_KEY || "").trim();
  if (!bypassKey) {
    return json({ error: "Share links are not configured." }, 503);
  }

  const cookies = parseCookies(context.request.headers.get("Cookie"));
  const authed = await verifyAuthToken(gate.password, cookies[AUTH_COOKIE_NAME]);
  if (!authed) {
    return json({ error: "Unlock the gate first." }, 401);
  }

  const requestUrl = new URL(context.request.url);
  const path = safeRedirectPath(
    requestUrl.searchParams.get("path") || "/",
  );
  const url = buildGateShareUrl(requestUrl.origin, path, bypassKey);
  if (!url) {
    return json({ error: "Could not build a share link." }, 500);
  }

  return json({ url, path });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}
