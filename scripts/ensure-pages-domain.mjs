/**
 * Attach a custom domain to a Pages project and point DNS at its *.pages.dev target.
 * Run after deploy in CI. Requires the zone on the Gwenda account (see .env.example).
 *
 * Env:
 *   CUSTOM_DOMAIN — e.g. gwenda.co.uk or staging.gwenda.co.uk
 *   ZONE_NAME     — DNS zone (default: CUSTOM_DOMAIN), e.g. gwenda.co.uk for subdomains
 */

const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const PROJECT = process.env.PAGES_PROJECT_NAME || "gwenda";
const DOMAIN = process.env.CUSTOM_DOMAIN || "gwenda.co.uk";
const ZONE_NAME = process.env.ZONE_NAME || DOMAIN;

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
    const err = new Error(msg);
    err.status = res.status;
    err.code = data.errors?.[0]?.code;
    throw err;
  }
  return data.result;
}

function dnsRecordLabel() {
  if (DOMAIN === ZONE_NAME) return "@";
  const suffix = `.${ZONE_NAME}`;
  if (DOMAIN.endsWith(suffix)) {
    return DOMAIN.slice(0, -suffix.length);
  }
  throw new Error(`CUSTOM_DOMAIN ${DOMAIN} is not under ZONE_NAME ${ZONE_NAME}`);
}

function pointsToPages(record, pagesTarget) {
  const target = pagesTarget.replace(/\.$/, "");
  const content = record.content?.replace(/\.$/, "");
  return record.type === "CNAME" && content === target;
}

const project = await cf(`/accounts/${ACCOUNT_ID}/pages/projects/${PROJECT}`);
const pagesTarget = project.subdomain.endsWith(".pages.dev")
  ? project.subdomain
  : `${project.subdomain}.pages.dev`;

const domains = await cf(
  `/accounts/${ACCOUNT_ID}/pages/projects/${PROJECT}/domains`,
);
const attached = domains?.some((d) => d.name === DOMAIN);

if (!attached) {
  try {
    await cf(`/accounts/${ACCOUNT_ID}/pages/projects/${PROJECT}/domains`, {
      method: "POST",
      body: { name: DOMAIN },
    });
    console.log(
      `Attached custom domain ${DOMAIN} to Pages project "${PROJECT}".`,
    );
  } catch (err) {
    if (err.code === 8000018) {
      console.log(`Custom domain ${DOMAIN} already attached.`);
    } else {
      throw err;
    }
  }
} else {
  console.log(`Custom domain ${DOMAIN} already on project "${PROJECT}".`);
}

const zones = await cf(`/zones?name=${ZONE_NAME}&account.id=${ACCOUNT_ID}`);
const zone = zones?.[0];

if (!zone) {
  console.warn(
    `Zone ${ZONE_NAME} is not on account ${ACCOUNT_ID} yet.\n` +
      "Move the zone to the Gwenda account for CI to manage DNS automatically.\n" +
      `Until then, point ${DOMAIN} CNAME → ${pagesTarget} at your DNS provider.`,
  );
  process.exit(0);
}

const hostRecords = await cf(
  `/zones/${zone.id}/dns_records?name=${encodeURIComponent(DOMAIN)}`,
);
const webRecords = hostRecords?.filter((r) =>
  ["A", "AAAA", "CNAME"].includes(r.type),
);

const correctCname = webRecords?.find((r) => pointsToPages(r, pagesTarget));

if (correctCname) {
  console.log(
    `DNS already configured: CNAME ${DOMAIN} → ${correctCname.content}`,
  );
  process.exit(0);
}

const existingCname = webRecords?.find((r) => r.type === "CNAME");

if (existingCname) {
  await cf(`/zones/${zone.id}/dns_records/${existingCname.id}`, {
    method: "PATCH",
    body: {
      type: "CNAME",
      name: dnsRecordLabel(),
      content: pagesTarget,
      proxied: true,
      ttl: 1,
    },
  });
  console.log(`Updated CNAME ${DOMAIN} → ${pagesTarget} (proxied).`);

  for (const record of webRecords ?? []) {
    if (record.id === existingCname.id) continue;
    await cf(`/zones/${zone.id}/dns_records/${record.id}`, {
      method: "DELETE",
    });
    console.log(`Removed extra ${record.type} ${DOMAIN} → ${record.content}`);
  }

  process.exit(0);
}

for (const record of webRecords ?? []) {
  await cf(`/zones/${zone.id}/dns_records/${record.id}`, {
    method: "DELETE",
  });
  console.log(`Removed ${record.type} ${DOMAIN} → ${record.content}`);
}

await cf(`/zones/${zone.id}/dns_records`, {
  method: "POST",
  body: {
    type: "CNAME",
    name: dnsRecordLabel(),
    content: pagesTarget,
    proxied: true,
    ttl: 1,
  },
});

console.log(`Created CNAME ${DOMAIN} → ${pagesTarget} (proxied).`);
