/**
 * Delete old CI preview deployments from a Pages project.
 *
 * Keeps the current preview (--keep-deployment-id) and all production deployments.
 * Targets preview branches named ci-* created by the production pipeline.
 *
 * Usage:
 *   node scripts/ci/prune-pages-previews.mjs \
 *     --project gwenda-blue \
 *     --keep-deployment-id <uuid>
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
const KEEP_ID = getArg("--keep-deployment-id");
const BRANCH_PREFIX = getArg("--branch-prefix") || "ci-";

if (!ACCOUNT_ID || !API_TOKEN || !PROJECT) {
  console.error(
    "Missing CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN, or --project",
  );
  process.exit(1);
}

function previewBranch(deployment) {
  return deployment.deployment_trigger?.metadata?.branch ?? "";
}

async function listDeployments() {
  const all = [];
  let page = 1;

  while (true) {
    const batch = await cf(
      `/accounts/${ACCOUNT_ID}/pages/projects/${PROJECT}/deployments?per_page=25&page=${page}`,
    );
    if (!batch?.length) break;
    all.push(...batch);
    if (batch.length < 25) break;
    page += 1;
  }

  return all;
}

const deployments = await listDeployments();
const stale = deployments.filter((deployment) => {
  if (deployment.environment !== "preview") return false;
  if (KEEP_ID && deployment.id === KEEP_ID) return false;
  return previewBranch(deployment).startsWith(BRANCH_PREFIX);
});

if (stale.length === 0) {
  console.log(`No stale ${BRANCH_PREFIX}* preview deployments to prune.`);
  process.exit(0);
}

console.log(
  `Pruning ${stale.length} stale preview deployment(s) from "${PROJECT}"...`,
);

let deleted = 0;
let skipped = 0;

for (const deployment of stale) {
  const branch = previewBranch(deployment);
  try {
    await cf(
      `/accounts/${ACCOUNT_ID}/pages/projects/${PROJECT}/deployments/${deployment.id}?force=true`,
      { method: "DELETE" },
    );
    deleted += 1;
    console.log(`Deleted preview ${deployment.id} (${branch}).`);
  } catch (err) {
    skipped += 1;
    console.warn(
      `Could not delete preview ${deployment.id} (${branch}): ${err.message}`,
    );
  }
}

console.log(
  `Preview prune complete: ${deleted} deleted, ${skipped} skipped, kept ${KEEP_ID || "(none specified)"}.`,
);
