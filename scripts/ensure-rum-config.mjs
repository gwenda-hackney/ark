/**
 * Align Cloudflare Web Analytics with our manual beacon embed (Analytics.astro).
 *
 * We bake PUBLIC_CF_BEACON_TOKEN into the build, so RUM auto_install must be OFF.
 * When auto_install is on, Cloudflare injects a second beacon and manual POSTs to
 * cloudflareinsights.com/cdn-cgi/rum can 404.
 *
 * Env: CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN, SITE_HOST (default gwenda.co.uk)
 */

const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const HOST = process.env.SITE_HOST || "gwenda.co.uk";

if (!ACCOUNT_ID || !API_TOKEN) {
  console.error("Missing CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_API_TOKEN");
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
    throw new Error(msg);
  }
  return data.result;
}

function findSiteForHost(sites, host) {
  return (
    sites?.find((s) => s.rules?.some((r) => r.host === host)) ??
    sites?.find((s) => s.ruleset?.zone_name === host) ??
    (sites?.length === 1 ? sites[0] : null)
  );
}

const sites = await cf(`/accounts/${ACCOUNT_ID}/rum/site_info/list`);
let site = findSiteForHost(sites, HOST);

if (!site) {
  const zones = await cf(`/zones?name=${HOST}&account.id=${ACCOUNT_ID}`);
  const zone = zones?.[0];
  const body = zone
    ? { host: HOST, zone_tag: zone.id, auto_install: false }
    : { host: HOST, auto_install: false };

  site = await cf(`/accounts/${ACCOUNT_ID}/rum/site_info`, {
    method: "POST",
    body,
  });
  console.log(`Created Web Analytics site for ${HOST} (manual embed, auto_install=false).`);
}

const siteTag = site.site_tag;
if (!siteTag) {
  console.error("Could not resolve Web Analytics site_tag.");
  process.exit(1);
}

if (site.auto_install !== false) {
  const zoneTag = site.ruleset?.zone_tag;
  try {
    await cf(`/accounts/${ACCOUNT_ID}/rum/site_info/${siteTag}`, {
      method: "PUT",
      body: {
        auto_install: false,
        enabled: true,
        host: HOST,
        ...(zoneTag ? { zone_tag: zoneTag } : {}),
      },
    });
    console.log(`Set auto_install=false on Web Analytics site for ${HOST}.`);
  } catch (err) {
    console.warn(
      `Could not set auto_install=false (${err.message}).\n` +
        `Disable automatic injection in Cloudflare dashboard → Web Analytics → ${HOST} → Manage site,\n` +
        `or grant Analytics Edit on CLOUDFLARE_API_TOKEN. Manual beacon embed requires auto_install off.`,
    );
  }
} else {
  console.log(`Web Analytics for ${HOST} already uses manual embed (auto_install=false).`);
}
