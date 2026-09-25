// Signed magic links for form email verification and edit-draft links.
// Token shape: base64url(payloadJson).base64url(hmac).

import { resolvePublicOrigin } from "./public-origin.js";

const FORM_VERIFY_SCOPE = "gwenda-form-verify-v1";
const FORM_RESEND_SCOPE = "gwenda-form-resend-v1";
const FORM_EDIT_SCOPE = "gwenda-form-edit-v1";
/** Link lifetime: 48 hours. */
export const FORM_VERIFY_TTL_MS = 48 * 60 * 60 * 1000;

function bufferToBase64Url(buf) {
  const bytes = buf instanceof ArrayBuffer ? new Uint8Array(buf) : buf;
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function stringToBase64Url(str) {
  return bufferToBase64Url(new TextEncoder().encode(str));
}

function base64UrlToString(value) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  const bin = atob(padded + pad);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function formVerifySecret(env) {
  return (
    env?.SUBSCRIBE_SECRET?.trim() ||
    env?.TICKET_SECRET?.trim() ||
    ""
  );
}

async function hmacSign(secret, message) {
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
    new TextEncoder().encode(message),
  );
  return bufferToBase64Url(sig);
}

function matchesToken(provided, expected) {
  if (!provided || !expected || provided.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < provided.length; i++) {
    diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * @returns {Promise<string | null>}
 */
export async function createFormVerifyToken(
  env,
  { rowId, email, slug, exp = Date.now() + FORM_VERIFY_TTL_MS },
) {
  const secret = formVerifySecret(env);
  const cleanRow = String(rowId ?? "").trim();
  const cleanEmail = String(email ?? "").trim().toLowerCase();
  const cleanSlug = String(slug ?? "").trim();
  if (!secret || !cleanRow || !cleanEmail || !cleanSlug) return null;

  const payload = stringToBase64Url(
    JSON.stringify({
      v: FORM_VERIFY_SCOPE,
      rowId: cleanRow,
      email: cleanEmail,
      slug: cleanSlug,
      exp,
    }),
  );
  const sig = await hmacSign(secret, payload);
  return `${payload}.${sig}`;
}

/**
 * @returns {Promise<
 *   | { ok: true, rowId: string, email: string, slug: string }
 *   | { ok: false, reason: "missing" | "invalid" | "expired", rowId?: string, email?: string, slug?: string }
 * >}
 */
export async function parseFormVerifyToken(env, token) {
  const raw = String(token ?? "").trim();
  if (!raw || !raw.includes(".")) {
    return { ok: false, reason: "missing" };
  }

  const [payload, sig] = raw.split(".");
  if (!payload || !sig) return { ok: false, reason: "invalid" };

  const secret = formVerifySecret(env);
  if (!secret) return { ok: false, reason: "invalid" };

  const expected = await hmacSign(secret, payload);
  if (!matchesToken(sig, expected)) {
    return { ok: false, reason: "invalid" };
  }

  let data;
  try {
    data = JSON.parse(base64UrlToString(payload));
  } catch {
    return { ok: false, reason: "invalid" };
  }

  if (
    data?.v !== FORM_VERIFY_SCOPE ||
    !data.rowId ||
    !data.email ||
    !data.slug ||
    typeof data.exp !== "number"
  ) {
    return { ok: false, reason: "invalid" };
  }

  if (Date.now() > data.exp) {
    return {
      ok: false,
      reason: "expired",
      rowId: String(data.rowId),
      email: String(data.email).toLowerCase(),
      slug: String(data.slug),
    };
  }

  return {
    ok: true,
    rowId: String(data.rowId),
    email: String(data.email).toLowerCase(),
    slug: String(data.slug),
  };
}

/**
 * Non-expiring edit-draft token for receipt "change your application" links.
 * @returns {Promise<string | null>}
 */
export async function createFormEditToken(env, { rowId, email, slug }) {
  const secret = formVerifySecret(env);
  const cleanRow = String(rowId ?? "").trim();
  const cleanEmail = String(email ?? "").trim().toLowerCase();
  const cleanSlug = String(slug ?? "").trim();
  if (!secret || !cleanRow || !cleanEmail || !cleanSlug) return null;

  const payload = stringToBase64Url(
    JSON.stringify({
      v: FORM_EDIT_SCOPE,
      rowId: cleanRow,
      email: cleanEmail,
      slug: cleanSlug,
    }),
  );
  const sig = await hmacSign(secret, payload);
  return `${payload}.${sig}`;
}

/**
 * @returns {Promise<
 *   | { ok: true, rowId: string, email: string, slug: string }
 *   | { ok: false, reason: "missing" | "invalid", rowId?: string, email?: string, slug?: string }
 * >}
 */
export async function parseFormEditToken(env, token) {
  const raw = String(token ?? "").trim();
  if (!raw || !raw.includes(".")) {
    return { ok: false, reason: "missing" };
  }

  const [payload, sig] = raw.split(".");
  if (!payload || !sig) return { ok: false, reason: "invalid" };

  const secret = formVerifySecret(env);
  if (!secret) return { ok: false, reason: "invalid" };

  const expected = await hmacSign(secret, payload);
  if (!matchesToken(sig, expected)) {
    return { ok: false, reason: "invalid" };
  }

  let data;
  try {
    data = JSON.parse(base64UrlToString(payload));
  } catch {
    return { ok: false, reason: "invalid" };
  }

  if (
    data?.v !== FORM_EDIT_SCOPE ||
    !data.rowId ||
    !data.email ||
    !data.slug
  ) {
    return { ok: false, reason: "invalid" };
  }

  return {
    ok: true,
    rowId: String(data.rowId),
    email: String(data.email).toLowerCase(),
    slug: String(data.slug),
  };
}

/** Opaque token bound to row+slug so the client can resend without guessing ids alone. */
export async function createFormResendToken(env, { rowId, slug }) {
  const secret = formVerifySecret(env);
  const cleanRow = String(rowId ?? "").trim();
  const cleanSlug = String(slug ?? "").trim();
  if (!secret || !cleanRow || !cleanSlug) return null;
  return hmacSign(secret, `${FORM_RESEND_SCOPE}:${cleanRow}:${cleanSlug}`);
}

export async function verifyFormResendToken(env, { rowId, slug, token }) {
  const expected = await createFormResendToken(env, { rowId, slug });
  if (!expected || !token) return false;
  return matchesToken(String(token).trim(), expected);
}

/** Public origin for verify links: real host in production and its preview, request origin locally. */
export function formVerifyOrigin(requestUrl, env) {
  const siteEnv = env?.SITE_ENV?.trim();
  if (siteEnv === "production") {
    return resolvePublicOrigin(requestUrl, env);
  }
  try {
    return new URL(requestUrl).origin;
  } catch {
    return resolvePublicOrigin(requestUrl, env);
  }
}

export async function buildFormVerifyUrl(requestUrl, env, token) {
  if (!token) return null;
  const origin = formVerifyOrigin(requestUrl, env);
  const url = new URL(`${origin}/contact/verify`);
  url.searchParams.set("t", token);
  return url.toString();
}

export async function buildFormEditUrl(requestUrl, env, token) {
  if (!token) return null;
  const origin = formVerifyOrigin(requestUrl, env);
  const url = new URL(`${origin}/contact/edit`);
  url.searchParams.set("t", token);
  return url.toString();
}
