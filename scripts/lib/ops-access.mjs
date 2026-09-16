/** Shared helpers for Cloudflare Access on gwenda-ops. */

export const OPS_ACCESS_APP_NAME = "Gwenda ops";
export const OPS_ACCESS_PREVIEW_APP_NAME = "Gwenda ops previews";
export const OPS_ACCESS_DOMAIN = "gwenda-ops.pages.dev";
export const OPS_ACCESS_PREVIEW_DOMAIN = "*.gwenda-ops.pages.dev";
export const OPS_ACCESS_IDP_NAME = "Google";

export const ACCESS_ENABLE_HINT = `Cloudflare Zero Trust (Access) is not enabled on this account yet.
Open https://one.dash.cloudflare.com/ and complete the first-run setup (Enable Access).
Pages fallback: gwenda-ops → Settings → General → Access policy.`;

export const ACCESS_WRITE_HINT = `CLOUDFLARE_DEV_API_TOKEN needs Access write (this is the local DEV token, not an Access-only token).
Edit or recreate it at https://dash.cloudflare.com/profile/api-tokens:
  Permissions:
    Account | Cloudflare Pages | Edit
    Account | Access: Apps and Policies | Edit
    Account | Access: Organizations, Identity Providers, and Groups | Edit
  Account resources: Include → the Gwenda account
Then:
  npm run env:set -- CLOUDFLARE_DEV_API_TOKEN '…'
  npm run setup:ops-access`;

export function parseEmailList(raw) {
  return String(raw || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function googleCallbackUrl(authDomain) {
  const host = String(authDomain || "")
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "");
  return `https://${host}/cdn-cgi/access/callback`;
}

export function googleOriginUrl(authDomain) {
  const host = String(authDomain || "")
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "");
  return `https://${host}`;
}

export function googleIdpBody({ clientId, clientSecret }) {
  return {
    name: OPS_ACCESS_IDP_NAME,
    type: "google",
    config: {
      client_id: clientId,
      client_secret: clientSecret,
    },
  };
}

export function accessAppBody({ name, domain, googleIdpId }) {
  const body = {
    name,
    domain,
    type: "self_hosted",
    session_duration: "336h",
    app_launcher_visible: false,
    destinations: [{ type: "public", uri: domain }],
    self_hosted_domains: [domain],
  };
  if (googleIdpId) {
    body.allowed_idps = [googleIdpId];
    body.auto_redirect_to_identity = true;
  }
  return body;
}

/** Anyone who authenticates at the Google IdP. Membership is the Baserow Users table. */
export function allowAuthenticatedPolicyBody() {
  return {
    name: "Allow Google",
    decision: "allow",
    precedence: 1,
    include: [{ everyone: {} }],
  };
}

export function isAccessChallenge(status, location) {
  if (![301, 302, 303, 307, 308].includes(Number(status))) return false;
  const loc = String(location || "");
  return /cloudflareaccess\.com/i.test(loc) || /\/cdn-cgi\/access\//i.test(loc);
}

export function findNamed(items, name) {
  return (items || []).find((item) => item?.name === name) || null;
}

export function findAppForDomain(apps, domain) {
  return (
    (apps || []).find((app) => {
      if (app?.domain === domain) return true;
      const hosted = app?.self_hosted_domains;
      if (Array.isArray(hosted) && hosted.includes(domain)) return true;
      const destinations = app?.destinations;
      if (
        Array.isArray(destinations) &&
        destinations.some((d) => d?.uri === domain)
      ) {
        return true;
      }
      return false;
    }) || null
  );
}
