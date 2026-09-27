import {
  buildAuthCookie,
  createPasswordToken,
  isSecureOrigin,
  requestOrigin,
  resolveAuth,
  safeRedirectPath,
} from "../../src/features/access/server/auth.js";
import { opsEnv } from "../../src/platform/ops-env.js";

/** Gate mode for the UI. */
export async function onRequestGet(context) {
  const auth = resolveAuth(await opsEnv(context));
  if (auth.kind === "google") {
    return json({
      mode: "google",
      password: Boolean(auth.password),
    });
  }
  if (auth.kind === "password") {
    return json({ mode: "password" });
  }
  return json({ mode: "misconfigured" }, 503);
}

/** Optional local admin password login when OPS_LOCAL_ADMIN_PW is set. */
export async function onRequestPost(context) {
  const auth = resolveAuth(await opsEnv(context));
  let body;
  try {
    body = await context.request.json();
  } catch {
    return json({ error: "Invalid request." }, 400);
  }

  if (!auth.password) {
    return json({ error: "Use Continue with Google." }, 400);
  }

  const password = body.password ?? "";
  if (password !== auth.password) {
    return json({ error: "That password isn't right." }, 401);
  }

  const token = await createPasswordToken(auth.password);
  const redirect = safeRedirectPath(body.next);
  return json({ ok: true, redirect }, 200, {
    "Set-Cookie": buildAuthCookie(token, {
      secure: isSecureOrigin(requestOrigin(context.request)),
    }),
  });
}

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...extraHeaders },
  });
}
