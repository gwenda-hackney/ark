/**
 * Allow AI crawlers on the production zone via Cloudflare Bot Management API.
 *
 * Env: CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN, ZONE_NAME (default gwenda.co.uk)
 * Token needs permission: App Security | Bot Management | Edit on gwenda.co.uk
 */
import {
  createCfClient,
  ensureZoneAiAccess,
  TOKEN_PERMISSION_HINT,
} from "./lib/zone-ai-access.mjs";

const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const ZONE_NAME = process.env.ZONE_NAME || "gwenda.co.uk";
const VERIFY_ORIGIN =
  process.env.ZONE_VERIFY_ORIGIN ||
  (ZONE_NAME.startsWith("http") ? ZONE_NAME : `https://${ZONE_NAME}`);

if (!ACCOUNT_ID || !API_TOKEN) {
  console.error("Missing CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_API_TOKEN");
  process.exit(1);
}

try {
  const cf = createCfClient({ accountId: ACCOUNT_ID, apiToken: API_TOKEN });
  const { zoneId, config } = await ensureZoneAiAccess(cf, ZONE_NAME, {
    verifyOrigin: VERIFY_ORIGIN,
  });

  console.log(`Zone ${ZONE_NAME} (${zoneId}): AI crawler access enabled.`);
  console.log(
    `  ai_bots_protection=${config.ai_bots_protection}, is_robots_txt_managed=${config.is_robots_txt_managed}, cf_robots_variant=${config.cf_robots_variant}`,
  );
  console.log(`Verified live robots.txt at ${VERIFY_ORIGIN}/robots.txt`);
} catch (err) {
  console.error(err.message || err);
  if (!String(err.message || "").includes(TOKEN_PERMISSION_HINT)) {
    console.error(TOKEN_PERMISSION_HINT);
  }
  process.exit(1);
}
