import { isRequestAuthed, resolveAuth } from "../src/access/server/auth.js";
import { opsEnv } from "../src/platform/ops-env.js";
import {
  WEBSITE_PASS_PARAM,
  createWebsitePass,
  passReturnUrl,
} from "../../../shared/website-pass.js";

/**
 * Website preview sign-in (shared/website-pass.js). The middleware has already
 * signed you in with Google and checked the ops users list; this sends you back
 * to the preview with a pass that works there for five minutes.
 */
export async function onRequestGet(context) {
  const env = await opsEnv(context);
  const auth = resolveAuth(env);
  if (auth.kind === "misconfigured" || !(await isRequestAuthed(auth, context.request))) {
    return text("Sign in to ops first.", 401);
  }
  const target = passReturnUrl(new URL(context.request.url).searchParams.get("return"), env.SITE_ENV);
  if (!target) return text("That isn't a Gwenda preview site.", 400);
  const key = String(env.GATE_BYPASS_KEY || "").trim();
  if (!key) return text("Website sign-in isn't set up: ops has no GATE_BYPASS_KEY.", 503);
  target.searchParams.set(WEBSITE_PASS_PARAM, await createWebsitePass(key, target.host));
  return new Response(null, {
    status: 302,
    headers: { Location: target.href, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
  });
}

function text(message, status) {
  return new Response(message, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
