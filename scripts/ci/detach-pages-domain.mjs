/**
 * Detach a custom domain from a Cloudflare Pages project.
 */
import { cf } from "../_lib/cloudflare-api.mjs";

const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const PROJECT = process.env.PAGES_PROJECT_NAME;
const DOMAIN = process.env.CUSTOM_DOMAIN || "gwenda.co.uk";

if (!ACCOUNT_ID || !API_TOKEN || !PROJECT) {
  console.error(
    "Missing CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN, or PAGES_PROJECT_NAME",
  );
  process.exit(1);
}

const domains = await cf(
  `/accounts/${ACCOUNT_ID}/pages/projects/${PROJECT}/domains`,
);
const match = domains?.find((d) => d.name === DOMAIN);

if (!match) {
  console.log(
    `Domain ${DOMAIN} not attached to project "${PROJECT}" — nothing to detach.`,
  );
  process.exit(0);
}

await cf(
  `/accounts/${ACCOUNT_ID}/pages/projects/${PROJECT}/domains/${match.id}`,
  { method: "DELETE" },
);
console.log(`Detached ${DOMAIN} from Pages project "${PROJECT}".`);
