import {
  buildAuthCookie,
  createAccessEmailToken,
  createPasswordToken,
  isSecureOrigin,
  normalizeEmail,
  requestOrigin,
  resolveAuth,
  safeRedirectPath,
} from "../_lib/auth.js";
import { isOpsUser } from "../_lib/user-store.js";

/** Gate mode for the local UI. Production Access never hits this. */
export async function onRequestGet(context) {
  const auth = resolveAuth(context.env);
  if (auth.kind === "password") {
    return json({ mode: "password" });
  }
  if (auth.local) {
    return json({
      mode: "access",
      defaultEmail: auth.defaultEmail || "",
    });
  }
  return json({ mode: "access", production: true });
}

/**
 * Local password login, or local Access-sim email login (Users table).
 * Production uses Cloudflare Access (Google).
 */
export async function onRequestPost(context) {
  const auth = resolveAuth(context.env);
  let body;
  try {
    body = await context.request.json();
  } catch {
    return json({ error: "Invalid request." }, 400);
  }

  const redirect = safeRedirectPath(body.next);
  const secure = isSecureOrigin(requestOrigin(context.request));

  if (auth.kind === "password") {
    const password = body.password ?? "";
    if (password !== auth.password) {
      return json({ error: "That password isn't right." }, 401);
    }
    const token = await createPasswordToken(auth.password);
    return json({ ok: true, redirect }, 200, {
      "Set-Cookie": buildAuthCookie(token, { secure }),
    });
  }

  if (!auth.local) {
    return json(
      { error: "Sign in with Google on the live ops site." },
      400,
    );
  }

  if (!auth.sessionSecret) {
    return json(
      {
        error:
          "Set OPS_PASSWORD or OPS_DEV_ACCESS_SECRET in .env for local Access.",
      },
      503,
    );
  }

  const email = normalizeEmail(body.email);
  if (!email || !email.includes("@")) {
    return json({ error: "Enter a Google email address." }, 400);
  }

  const allowed = await isOpsUser(context.env, email);
  if (!allowed) {
    return json(
      { error: "That Google account is not on the ops users list." },
      403,
    );
  }

  const token = await createAccessEmailToken(auth.sessionSecret, email);
  return json({ ok: true, redirect }, 200, {
    "Set-Cookie": buildAuthCookie(token, { secure }),
  });
}

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...extraHeaders },
  });
}
