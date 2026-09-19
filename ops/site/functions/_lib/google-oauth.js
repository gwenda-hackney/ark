/**
 * Google OAuth (OIDC) helpers for ops login.
 */
import {
  bytesToBase64Url,
  googleClientId,
  googleClientSecret,
  normalizeEmail,
  requestOrigin,
} from "./auth.js";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";

export function randomUrlSafe(bytes = 32) {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return bytesToBase64Url(buf);
}

async function sha256Base64Url(value) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return bytesToBase64Url(digest);
}

export function googleRedirectUri(request) {
  return `${requestOrigin(request)}/api/auth/callback`;
}

export async function buildGoogleAuthorizeUrl(env, request, { state, codeVerifier, next }) {
  const clientId = googleClientId(env);
  if (!clientId) throw new Error("GOOGLE_OAUTH_CLIENT_ID is not configured.");
  const challenge = await sha256Base64Url(codeVerifier);
  const url = new URL(AUTH_URL);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", googleRedirectUri(request));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", `${state}.${encodeURIComponent(next || "/")}`);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("prompt", "select_account");
  return url.toString();
}

export function parseOauthStateParam(raw) {
  const value = String(raw || "");
  const dot = value.indexOf(".");
  if (dot <= 0) return { state: value, next: "/" };
  return {
    state: value.slice(0, dot),
    next: decodeURIComponent(value.slice(dot + 1) || "/") || "/",
  };
}

export async function exchangeGoogleCode(env, request, { code, codeVerifier }) {
  const clientId = googleClientId(env);
  const clientSecret = googleClientSecret(env);
  if (!clientId || !clientSecret) {
    const error = new Error("Google OAuth is not configured.");
    error.status = 503;
    throw error;
  }
  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: googleRedirectUri(request),
    grant_type: "authorization_code",
    code_verifier: codeVerifier,
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(
      payload?.error_description || payload?.error || "Google token exchange failed.",
    );
    error.status = 401;
    throw error;
  }
  return payload;
}

export async function googleEmailFromTokens(tokens) {
  if (tokens?.id_token) {
    const parts = String(tokens.id_token).split(".");
    if (parts.length >= 2) {
      try {
        const json = JSON.parse(
          atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")),
        );
        const email = normalizeEmail(json.email);
        if (email && json.email_verified !== false) return email;
      } catch {
        /* fall through to userinfo */
      }
    }
  }
  const accessToken = tokens?.access_token;
  if (!accessToken) return "";
  const res = await fetch(USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const profile = await res.json().catch(() => ({}));
  if (!res.ok) return "";
  return normalizeEmail(profile.email);
}
