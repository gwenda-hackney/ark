/**
 * Roll back a Pages project to a previous production deployment.
 *
 * Usage:
 *   node scripts/ci/rollback-pages-production.mjs --project gwenda-blue --deployment-id <id>
 */
import { cf } from "../_lib/cloudflare-api.mjs";

const args = process.argv.slice(2);

function getArg(name) {
  const idx = args.indexOf(name);
  return idx >= 0 ? args[idx + 1] : undefined;
}

const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const PROJECT = getArg("--project") || process.env.PAGES_PROJECT_NAME;
const DEPLOYMENT_ID =
  getArg("--deployment-id") || process.env.ROLLBACK_DEPLOYMENT_ID;

if (!ACCOUNT_ID || !API_TOKEN || !PROJECT || !DEPLOYMENT_ID) {
  console.error(
    "Missing CLOUDFLARE credentials, --project, or --deployment-id",
  );
  process.exit(1);
}

console.error(
  `Rolling back "${PROJECT}" to production deployment ${DEPLOYMENT_ID}...`,
);

await cf(
  `/accounts/${ACCOUNT_ID}/pages/projects/${PROJECT}/deployments/${DEPLOYMENT_ID}/rollback`,
  { method: "POST" },
);

console.log(`Rollback complete for "${PROJECT}" (${DEPLOYMENT_ID}).`);
