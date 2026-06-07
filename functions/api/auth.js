import {
  buildAuthCookie,
  createAuthToken,
  safeRedirectPath,
} from "../_lib/site-auth.js";

export async function onRequestPost(context) {
  const expected = context.env.SITE_PASSWORD;
  if (!expected) {
    return json({ ok: true, redirect: "/" });
  }

  let body;
  try {
    body = await context.request.json();
  } catch {
    return json({ error: "Invalid request." }, 400);
  }

  const password = body.password ?? "";
  if (password !== expected) {
    return json({ error: "That password isn't right." }, 401);
  }

  const token = await createAuthToken(expected);
  const redirect = safeRedirectPath(body.next);

  return json(
    { ok: true, redirect },
    200,
    { "Set-Cookie": buildAuthCookie(token) },
  );
}

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...extraHeaders },
  });
}
