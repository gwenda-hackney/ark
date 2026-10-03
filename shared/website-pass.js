/**
 * Website preview sign-in through ops (Google). The preview's password page
 * sends you to ops `/website-pass`; ops (signed in, an ops user) sends you back
 * with `?pass=`, a note signed with GATE_BYPASS_KEY that only works on that
 * site and only for a few minutes. The website then sets its usual cookie.
 * (Ops' own branch previews use a different trick, a shared cookie domain:
 * ops/site/src/access/server/preview-signin.js. The website is another Pages
 * project, so it can't share ops' cookie.)
 */

export const WEBSITE_PASS_PARAM = "pass";
const PASS_SCOPE = "gwenda-website-pass-v1";
const PASS_TTL_MS = 5 * 60 * 1000;

/** Where each ops sends passes: production ops to the production website's previews, dev ops to the dev website's. */
const PASS_HOSTS = {
  production: /^(?:[a-z0-9-]{1,63}\.)?gwenda-blue\.pages\.dev$/,
  dev: /^(?:[a-z0-9-]{1,63}\.)?gwenda-web-dev\.pages\.dev$/,
};

const OPS_URLS = {
  production: "https://gwenda-ops.pages.dev",
  dev: "https://gwenda-ops-dev.pages.dev",
};

/** The ops site that signs passes for a website running as `siteEnv`. */
export function opsUrlFor(siteEnv) {
  return siteEnv === "production" ? OPS_URLS.production : OPS_URLS.dev;
}

/** `returnTo` when ops running as `siteEnv` may send a pass there, else null. */
export function passReturnUrl(returnTo, siteEnv) {
  const hosts = siteEnv === "production" ? PASS_HOSTS.production : PASS_HOSTS.dev;
  try {
    const url = new URL(String(returnTo || ""));
    if (url.protocol !== "https:" || !hosts.test(url.hostname)) return null;
    if (url.port || url.username || url.password) return null;
    return url;
  } catch {
    return null;
  }
}

function base64Url(bytes) {
  let bin = "";
  for (const byte of bytes) bin += String.fromCharCode(byte);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text) {
  const b64 = text.replace(/-/g, "+").replace(/_/g, "/");
  return atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, "="));
}

async function sign(key, body) {
  const hmac = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    hmac,
    new TextEncoder().encode(`${PASS_SCOPE}.${body}`),
  );
  return base64Url(new Uint8Array(sig));
}

function sameText(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** A pass for `host`, valid for five minutes. */
export async function createWebsitePass(key, host, now = Date.now()) {
  if (!key || !host) throw new Error("A website pass needs a key and a host.");
  const body = base64Url(
    new TextEncoder().encode(JSON.stringify({ host, exp: now + PASS_TTL_MS })),
  );
  return `${body}.${await sign(key, body)}`;
}

/** Whether `pass` was signed with `key` for `host` and hasn't expired. */
export async function verifyWebsitePass(key, pass, host, now = Date.now()) {
  const [body, sig, extra] = String(pass || "").split(".");
  if (!key || !body || !sig || extra !== undefined) return false;
  if (!sameText(sig, await sign(key, body))) return false;
  try {
    const claims = JSON.parse(fromBase64Url(body));
    return claims.host === host && Number(claims.exp) > now;
  } catch {
    return false;
  }
}
