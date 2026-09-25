/** Constant-time check of `Authorization: Bearer <secret>`. */
export function verifyBearerSecret(request, secret) {
  const expected = secret?.trim();
  if (!expected) return false;

  const header = request.headers.get("Authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return false;

  const provided = match[1].trim();
  if (provided.length !== expected.length) return false;

  let diff = 0;
  for (let i = 0; i < provided.length; i += 1) {
    diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

/** Ops → web calls (e.g. resend form emails). Per-env secret, see docs/env.md. */
export function verifyFormsAdminRequest(request, env) {
  return verifyBearerSecret(request, env.FORMS_ADMIN_SECRET);
}

export function adminUnauthorized() {
  return new Response(JSON.stringify({ error: "Unauthorized." }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
}
