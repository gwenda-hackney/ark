export function verifyEventAdminRequest(request, env) {
  const secret = env.EVENT_ADMIN_SECRET?.trim();
  if (!secret) return false;

  const header = request.headers.get("Authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return false;

  const provided = match[1].trim();
  if (provided.length !== secret.length) return false;

  let diff = 0;
  for (let i = 0; i < provided.length; i += 1) {
    diff |= provided.charCodeAt(i) ^ secret.charCodeAt(i);
  }
  return diff === 0;
}

export function eventAdminUnauthorized() {
  return new Response(JSON.stringify({ error: "Unauthorized." }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
}
