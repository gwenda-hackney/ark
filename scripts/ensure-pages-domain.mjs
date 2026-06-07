/**
 * Attach gwenda.co.uk to the Pages project and ensure DNS on the same account.
 * Run after deploy in CI. Requires zone on the Gwenda account (see .env.example).
 */

const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const PROJECT = process.env.PAGES_PROJECT_NAME || "gwenda";
const DOMAIN = process.env.CUSTOM_DOMAIN || "gwenda.co.uk";

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

const project = await cf(`/accounts/${ACCOUNT_ID}/pages/projects/${PROJECT}`);
const pagesTarget = `${project.subdomain}.pages.dev`;

let domains = await cf(
  `/accounts/${ACCOUNT_ID}/pages/projects/${PROJECT}/domains`,
);
const attached = domains?.some((d) => d.name === DOMAIN);

if (!attached) {
  try {
    await cf(`/accounts/${ACCOUNT_ID}/pages/projects/${PROJECT}/domains`, {
      method: "POST",
      body: { name: DOMAIN },
    });
    console.log(`Attached custom domain ${DOMAIN} to Pages project "${PROJECT}".`);
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

const zones = await cf(`/zones?name=${DOMAIN}&account.id=${ACCOUNT_ID}`);
const zone = zones?.[0];

if (!zone) {
  console.warn(
    `Zone ${DOMAIN} is not on account ${ACCOUNT_ID} yet.\n` +
      "Move the zone to the Gwenda account for CI to manage DNS automatically.\n" +
      `Until then, point ${DOMAIN} CNAME → ${pagesTarget} at your DNS provider.`,
  );
  process.exit(0);
}

const records = await cf(`/zones/${zone.id}/dns_records?type=CNAME`);
const apexRecord = records?.find(
  (r) =>
    r.name === DOMAIN &&
    (r.content === pagesTarget || r.content === `${pagesTarget}.`),
);

if (!apexRecord) {
  await cf(`/zones/${zone.id}/dns_records`, {
    method: "POST",
    body: {
      type: "CNAME",
      name: "@",
      content: pagesTarget,
      proxied: true,
      ttl: 1,
    },
  });
  console.log(`Created CNAME ${DOMAIN} → ${pagesTarget} (proxied).`);
} else {
  console.log(`DNS already points ${DOMAIN} → ${apexRecord.content}.`);
}
