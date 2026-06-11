/**
 * Read production deployment metadata for a Pages project.
 *
 * Usage:
 *   node scripts/ci/get-production-deployment.mjs --project gwenda-blue --position current
 *   node scripts/ci/get-production-deployment.mjs --project gwenda-blue --branch ci-2026.06.11+abc
 */
import { appendFileSync } from "node:fs";
import { cf } from "../_lib/cloudflare-api.mjs";

const args = process.argv.slice(2);

function getArg(name) {
  const idx = args.indexOf(name);
  return idx >= 0 ? args[idx + 1] : undefined;
}

const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const PROJECT = getArg("--project") || process.env.PAGES_PROJECT_NAME;
const POSITION = getArg("--position") || "current";
const BRANCH = getArg("--branch");

if (!ACCOUNT_ID || !API_TOKEN || !PROJECT) {
  console.error(
    "Missing CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN, or --project",
  );
  process.exit(1);
}

function deploymentUrl(deployment) {
  const alias = deployment.aliases?.find((entry) =>
    String(entry).includes(".pages.dev"),
  );
  if (!alias) {
    const url = deployment.url || "";
    return url.startsWith("http") ? url : url ? `https://${url}` : "";
  }
  return String(alias).startsWith("http") ? alias : `https://${alias}`;
}

function isSuccessful(deployment) {
  return deployment.latest_stage?.status === "success";
}

function matchesBranch(deployment, branch) {
  const name = deployment.deployment_trigger?.metadata?.branch ?? "";
  return name === branch;
}

const deployments = await cf(
  `/accounts/${ACCOUNT_ID}/pages/projects/${PROJECT}/deployments?per_page=25`,
);

const successful = deployments.filter(isSuccessful);

let match;
if (BRANCH) {
  match = successful.find((deployment) => matchesBranch(deployment, BRANCH));
  if (!match) {
    console.error(
      `No successful deployment found for project "${PROJECT}" on branch "${BRANCH}".`,
    );
    process.exit(1);
  }
} else if (POSITION === "current") {
  match = successful.find(
    (deployment) => deployment.environment === "production",
  );
  if (!match) {
    console.error(`No successful production deployment for "${PROJECT}".`);
    process.exit(1);
  }
} else if (POSITION === "previous") {
  const production = successful.filter(
    (deployment) => deployment.environment === "production",
  );
  match = production[1];
  if (!match) {
    console.error(`No previous production deployment for "${PROJECT}".`);
    process.exit(1);
  }
} else {
  console.error(`Unknown --position: ${POSITION}`);
  process.exit(1);
}

const url = deploymentUrl(match);
console.log(
  JSON.stringify({
    id: match.id,
    environment: match.environment,
    branch: match.deployment_trigger?.metadata?.branch ?? "",
    url,
  }),
);

const outputPath = process.env.GITHUB_OUTPUT;
if (outputPath) {
  appendFileSync(outputPath, `deployment_id=${match.id}\n`);
  appendFileSync(outputPath, `deployment_url=${url}\n`);
  appendFileSync(
    outputPath,
    `deployment_branch=${match.deployment_trigger?.metadata?.branch ?? ""}\n`,
  );
}
