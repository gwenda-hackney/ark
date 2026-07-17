// Signs and verifies the unique `/events/<slug>/ticket` links guests use to view
// their RSVP ticket and download an Apple Wallet pass — no login, no email
// round trip required for testing. Same HMAC pattern as site-auth.js, works in
// both Cloudflare Workers and Node (Web Crypto API).

const TICKET_SCOPE = "gwenda-ticket-v1";

function bufferToBase64Url(buf) {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Reuses a secret already configured for another purpose, so no new setup is required. */
function ticketSecret(env) {
  return (
    env?.TICKET_SECRET?.trim() ||
    env?.EVENT_ADMIN_SECRET?.trim() ||
    env?.SUBSCRIBE_SECRET?.trim() ||
    ""
  );
}

async function signTicket(secret, slug, rowId) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${TICKET_SCOPE}:${slug}:${rowId}`),
  );
  return bufferToBase64Url(sig);
}

/** Returns null when no secret is configured (Wallet/ticket links stay disabled). */
export async function createTicketToken(env, slug, rowId) {
  const secret = ticketSecret(env);
  const cleanSlug = slug?.trim();
  if (!secret || !cleanSlug || !Number.isInteger(rowId)) return null;
  return signTicket(secret, cleanSlug, rowId);
}

function matchesToken(provided, expected) {
  if (!provided || !expected || provided.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < provided.length; i++) {
    diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

export async function verifyTicketToken(env, slug, rowId, token) {
  if (!token) return false;
  const expected = await createTicketToken(env, slug, rowId);
  if (!expected) return false;
  return matchesToken(token, expected);
}

/** `<origin>/events/<slug>/ticket?guest=<rowId>&t=<signature>`, or null if unsigned. */
export async function buildTicketUrl(origin, env, slug, rowId) {
  const token = await createTicketToken(env, slug, rowId);
  if (!token) return null;
  const base = String(origin || "https://gwenda.co.uk").replace(/\/$/, "");
  const url = new URL(`${base}/events/${encodeURIComponent(slug.trim())}/ticket`);
  url.searchParams.set("guest", String(rowId));
  url.searchParams.set("t", token);
  return url.toString();
}
