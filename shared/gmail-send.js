/**
 * Send mail through the Gmail API over HTTPS (no SMTP sockets on Pages).
 * Auth: service account JSON in GMAIL_SERVICE_ACCOUNT_JSON with domain-wide
 * delegation for gmail.send, impersonating the SMTP_USER mailbox.
 */
import MailComposer from "nodemailer/lib/mail-composer/index.js";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_SEND_URL =
  "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";
const GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";

/** @type {{ token: string, exp: number, key: string } | null} */
let cachedToken = null;

function bufferToBase64Url(buf) {
  const bytes = buf instanceof ArrayBuffer ? new Uint8Array(buf) : buf;
  let bin = "";
  for (let i = 0; i < bytes.length; i += 1) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function textToBase64Url(text) {
  return bufferToBase64Url(new TextEncoder().encode(text));
}

function pemToArrayBuffer(pem) {
  const b64 = String(pem || "")
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s+/g, "");
  if (!b64) throw new Error("Service account private key is empty.");
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

export function parseGmailServiceAccount(env = {}) {
  const raw = String(env.GMAIL_SERVICE_ACCOUNT_JSON || "").trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (
      parsed?.type !== "service_account" ||
      !parsed.client_email ||
      !parsed.private_key
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function gmailSender(env = {}) {
  return env.SMTP_USER?.trim() || "";
}

/** True when the service account and sending mailbox are both set. */
export function isGmailConfigured(env = {}) {
  return Boolean(parseGmailServiceAccount(env) && gmailSender(env));
}

async function mintAccessToken(account, subject) {
  const now = Math.floor(Date.now() / 1000);
  const header = textToBase64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = textToBase64Url(
    JSON.stringify({
      iss: account.client_email,
      sub: subject,
      scope: GMAIL_SEND_SCOPE,
      aud: TOKEN_URL,
      iat: now,
      exp: now + 3600,
    }),
  );
  const unsigned = `${header}.${claim}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(account.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsigned),
  );
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${unsigned}.${bufferToBase64Url(signature)}`,
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.access_token) {
    throw new Error(
      `Gmail token failed (${response.status}): ${
        payload.error_description || payload.error || "no access token"
      }`,
    );
  }
  return {
    token: String(payload.access_token),
    exp: now + Math.max(60, Number(payload.expires_in) || 3600) - 60,
  };
}

export async function gmailAccessToken(env) {
  const account = parseGmailServiceAccount(env);
  const subject = gmailSender(env);
  if (!account || !subject) {
    throw new Error("GMAIL_SERVICE_ACCOUNT_JSON or SMTP_USER is not configured.");
  }
  const cacheKey = `${account.client_email}:${subject}`;
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.key === cacheKey && cachedToken.exp > now) {
    return cachedToken.token;
  }
  const minted = await mintAccessToken(account, subject);
  cachedToken = { ...minted, key: cacheKey };
  return minted.token;
}

/** Build the RFC 822 message with nodemailer's composer (no transport). */
export function buildRawMessage(mail) {
  return new Promise((resolve, reject) => {
    new MailComposer(mail).compile().build((error, message) => {
      if (error) reject(error);
      else resolve(message);
    });
  });
}

/**
 * Send one message. Accepts nodemailer mail options
 * (from, to, replyTo, subject, text, html, headers, attachments).
 */
export async function sendGmail(env, mail) {
  const token = await gmailAccessToken(env);
  const raw = bufferToBase64Url(await buildRawMessage(mail));
  const response = await fetch(GMAIL_SEND_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      `Gmail send failed (${response.status}): ${
        payload.error?.message || "unknown error"
      }`,
    );
  }
  return { id: payload.id };
}
