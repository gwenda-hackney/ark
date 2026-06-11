/**
 * Ensure Cloudflare Web Analytics uses zone auto-injection (same as production).
 *
 * Proxied sites report to /cdn-cgi/rum on the live hostname — no manual HTML embed.
 * Run in CI for staging and production so both environments match.
 *
 * Env:
 *   SITE_HOST   — e.g. gwenda.co.uk or staging.gwenda.co.uk
 *   ZONE_NAME   — DNS zone (default: gwenda.co.uk)
 */

const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const HOST = process.env.SITE_HOST;
const ZONE_NAME = process.env.ZONE_NAME || "gwenda.co.uk";

if (!ACCOUNT_ID || !API_TOKEN || !HOST) {
  console.error(
    "Missing CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN, or SITE_HOST",
  );
  process.exit(1);
}

async function cf(path, { method = "GET", body } = {}) {
  const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!data.success) {
    const msg = data.errors?.map((e) => e.message).join("; ") || res.statusText;
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  return data.result;
}

function findSiteForHost(sites, host) {
  return (
    sites?.find((s) => s.rules?.some((r) => r.host === host)) ??
    sites?.find((s) => s.ruleset?.zone_name === host && host === ZONE_NAME) ??
    null
  );
}

function siteNeedsUpdate(site) {
  return site.auto_install !== true || site.ruleset?.enabled !== true;
}

const sites = await cf(`/accounts/${ACCOUNT_ID}/rum/site_info/list`);
let site = findSiteForHost(sites, HOST);

if (!site) {
  const zones = await cf(
    `/zones?name=${ZONE_NAME}&account.id=${ACCOUNT_ID}`,
  );
  const zone = zones?.[0];
  const body = zone
    ? { host: HOST, zone_tag: zone.id, auto_install: true, enabled: true }
    : { host: HOST, auto_install: true, enabled: true };

  try {
    site = await cf(`/accounts/${ACCOUNT_ID}/rum/site_info`, {
      method: "POST",
      body,
    });
    console.log(
      `Created Web Analytics for ${HOST} (auto_install, zone ${ZONE_NAME}).`,
    );
  } catch (err) {
    console.warn(
      `Could not create Web Analytics for ${HOST} (${err.message}).\n` +
        `Enable it in Cloudflare dashboard → Web Analytics, or grant Analytics Edit on CLOUDFLARE_API_TOKEN.`,
    );
    process.exit(0);
  }
}

const siteTag = site.site_tag;
if (!siteTag) {
  console.error(`Could not resolve Web Analytics site_tag for ${HOST}.`);
  process.exit(1);
}

if (siteNeedsUpdate(site)) {
  const zoneTag = site.ruleset?.zone_tag;
  const zones = zoneTag
    ? [{ id: zoneTag }]
    : await cf(`/zones?name=${ZONE_NAME}&account.id=${ACCOUNT_ID}`);
  const zone = zoneTag ? zones[0] : zones?.[0];

  try {
    await cf(`/accounts/${ACCOUNT_ID}/rum/site_info/${siteTag}`, {
      method: "PUT",
      body: {
        auto_install: true,
        enabled: true,
        host: HOST,
        ...(zone ? { zone_tag: zone.id ?? zoneTag } : {}),
      },
    });
    console.log(`Updated Web Analytics for ${HOST} (auto_install, enabled).`);
  } catch (err) {
    console.warn(
      `Could not update Web Analytics for ${HOST} (${err.message}).\n` +
        `Set auto-inject in Cloudflare dashboard → Web Analytics → ${HOST}.`,
    );
  }
} else {
  console.log(`Web Analytics for ${HOST} already matches production (auto_install, enabled).`);
}
