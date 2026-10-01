/**
 * Send mail through the Gmail API over HTTPS (no SMTP sockets on Pages).
 * Auth: service account JSON in GMAIL_SERVICE_ACCOUNT_JSON with domain-wide
 * delegation for gmail.send, impersonating MAIL_SENDER (shared/mail-from.js).
 */
import MailComposer from "nodemailer/lib/mail-composer/index.js";
import { environmentOf, getSetting } from "./config.js";
import { log } from "./log.js";
import { MAIL_SENDER } from "./mail-from.js";

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

/** True when the service account is set (the mailbox is MAIL_SENDER). */
export function isGmailConfigured(env = {}) {
  return Boolean(parseGmailServiceAccount(env));
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
  const subject = MAIL_SENDER;
  if (!account) throw new Error("GMAIL_SERVICE_ACCOUNT_JSON is not configured.");
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

const RECIPIENT_FIELDS = ["to", "cc", "bcc"];

function addressesOf(value) {
  const list = Array.isArray(value) ? value : value ? [value] : [];
  return list.flatMap((item) => {
    const text = typeof item === "object" && item ? item.address || "" : String(item);
    return text.split(",").map((part) => {
      const match = part.match(/<([^>]+)>/);
      return (match ? match[1] : part).trim().toLowerCase();
    });
  }).filter(Boolean);
}

/**
 * Outside production every recipient becomes the safe inbox (forms.notify_email:
 * alerts@ on hosted dev, FORMS_NOTIFY_EMAIL on a developer's machine), because
 * copied data carries real guests' addresses. The subject and a header keep the
 * original recipient visible. No safe inbox means no send, never the real one (#15).
 */
export async function safeMail(
  env,
  mail,
  { safeAddress = () => getSetting(env, "web", "forms.notify_email") } = {},
) {
  const envName = environmentOf(env);
  if (envName === "production") return mail;
  let safe = "";
  try {
    safe = String((await safeAddress()) || "").trim();
  } catch (error) {
    throw new Error(
      `Not sending outside production: no safe address (${error instanceof Error ? error.message : error}).`,
    );
  }
  if (!safe) {
    throw new Error(`forms.notify_email is not set for ${envName}; not sending outside production.`);
  }
  const original = RECIPIENT_FIELDS.flatMap((field) => addressesOf(mail[field]));
  if (original.length && original.every((address) => address === safe.toLowerCase())) return mail;
  const shown = original.join(", ") || "(no recipient)";
  log.event("info", "mail_redirected", { env: envName, original: shown, to: safe });
  const { to: _to, cc: _cc, bcc: _bcc, ...rest } = mail;
  return {
    ...rest,
    to: safe,
    subject: `[${envName}, for ${shown}] ${mail.subject || ""}`.trim(),
    headers: { ...(mail.headers || {}), "X-Gwenda-Original-To": shown },
  };
}

/**
 * Send one message. Accepts nodemailer mail options
 * (from, to, replyTo, subject, text, html, headers, attachments).
 * Outside production the recipients are replaced first (safeMail).
 */
export async function sendGmail(env, mail) {
  mail = await safeMail(env, mail);
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
