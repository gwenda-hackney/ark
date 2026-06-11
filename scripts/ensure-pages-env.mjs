/**
 * Set SITE_ENV on a Cloudflare Pages project (plain env var, not a secret).
 * Staging uses SITE_ENV=staging so middleware always requires SITE_PASSWORD.
 *
 * Run BEFORE sync-pages-secrets in CI — PATCHing deployment_configs here can
 * clear wrangler-managed secrets; the following secret sync restores them.
 */

const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const PROJECT = process.env.PAGES_PROJECT_NAME;
const SITE_ENV = process.env.SITE_ENV;

if (!ACCOUNT_ID || !API_TOKEN || !PROJECT || !SITE_ENV) {
  console.error(
    "Missing CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN, PAGES_PROJECT_NAME, or SITE_ENV",
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
  return { status: res.status, data };
}

const project = await cf(`/accounts/${ACCOUNT_ID}/pages/projects/${PROJECT}`);

if (!project.data.success) {
  const msg =
    project.data.errors?.map((e) => e.message).join("; ") || "Unknown error";
  console.error(`Could not load Pages project "${PROJECT}": ${msg}`);
  process.exit(1);
}

const configs = project.data.result.deployment_configs ?? {};
const deploymentEnvs = ["production", "preview"];

for (const name of deploymentEnvs) {
  configs[name] ??= {};
  configs[name].env_vars ??= {};
  configs[name].env_vars.SITE_ENV = { type: "plain_text", value: SITE_ENV };
}

const updated = await cf(`/accounts/${ACCOUNT_ID}/pages/projects/${PROJECT}`, {
  method: "PATCH",
  body: { deployment_configs: configs },
});

if (!updated.data.success) {
  const msg =
    updated.data.errors?.map((e) => e.message).join("; ") || "Unknown error";
  console.error(`Could not update Pages project "${PROJECT}": ${msg}`);
  process.exit(1);
}

console.log(`Set SITE_ENV=${SITE_ENV} on Pages project "${PROJECT}".`);
