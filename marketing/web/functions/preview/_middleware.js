/**
 * Password-protects /preview and /preview/* in production.
 * Set PREVIEW_PASSWORD in Cloudflare Pages environment variables.
 * Skipped when PREVIEW_PASSWORD is unset (e.g. local astro dev).
 */
export async function onRequest(context) {
  const expected = context.env.PREVIEW_PASSWORD;
  if (!expected) return context.next();

  const auth = context.request.headers.get("Authorization");
  if (auth?.startsWith("Basic ")) {
    const decoded = atob(auth.slice(6));
    const colon = decoded.indexOf(":");
    const password = colon >= 0 ? decoded.slice(colon + 1) : decoded;
    if (password === expected) return context.next();
  }

  return new Response("Gwenda preview — authentication required", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Gwenda Preview", charset="UTF-8"',
    },
  });
}
