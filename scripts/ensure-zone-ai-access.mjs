/**
 * Allow AI crawlers on the production zone: disable Cloudflare-managed robots.txt
 * blocks and edge rules that stop GPTBot, Google-Extended, etc.
 *
 * Env: CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN, ZONE_NAME (default gwenda.co.uk)
 */
const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const ZONE_NAME = process.env.ZONE_NAME || "gwenda.co.uk";

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

const zones = await cf(`/zones?name=${ZONE_NAME}&account.id=${ACCOUNT_ID}`);
const zone = zones?.[0];

if (!zone) {
  console.warn(
    `Zone ${ZONE_NAME} is not on account ${ACCOUNT_ID}. Skipping AI access config.`,
  );
  process.exit(0);
}

let current = {};
try {
  current = (await cf(`/zones/${zone.id}/bot_management`)) ?? {};
} catch (err) {
  if (err.status === 403 || err.code === 10000) {
    console.warn(
      `Bot Management API unavailable for ${ZONE_NAME} (${err.message}).\n` +
        "Disable “Block AI bots” and managed robots.txt manually in the Cloudflare dashboard:\n" +
        "Security → Bots → Configure Bot Fight Mode / AI bots.",
    );
    process.exit(0);
  }
  throw err;
}

const next = {
  ...current,
  ai_bots_protection: "disabled",
  crawler_protection: "disabled",
  is_robots_txt_managed: false,
  cf_robots_variant: "off",
};

await cf(`/zones/${zone.id}/bot_management`, { method: "PUT", body: next });

console.log(
  `Zone ${ZONE_NAME}: AI bot blocking disabled, managed robots.txt off.`,
);
console.log(
  "  ai_bots_protection=disabled, crawler_protection=disabled, is_robots_txt_managed=false",
);
