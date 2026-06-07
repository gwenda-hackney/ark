/**
 * Password-protects the whole site in production when SITE_PASSWORD is set.
 * Configure in Cloudflare Pages → Settings → Environment variables (production).
 * Unset locally so astro dev stays open.
 */
export async function onRequest(context) {
  const expected = context.env.SITE_PASSWORD;
  if (!expected) return context.next();

  const auth = context.request.headers.get("Authorization");
  if (auth?.startsWith("Basic ")) {
    const decoded = atob(auth.slice(6));
    const colon = decoded.indexOf(":");
    const password = colon >= 0 ? decoded.slice(colon + 1) : decoded;
    if (password === expected) return context.next();
  }

  return new Response("Gwenda — authentication required", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Gwenda", charset="UTF-8"',
    },
  });
}
