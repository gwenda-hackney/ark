/**
 * Cloudflare Pages project variables through the API: one GET and one PATCH
 * per project. `wrangler pages secret put` sends the same PATCH, but one
 * process per key per environment (~1.5s each), so a full sync took 1–2.5
 * minutes. The PATCH merges into what is there; a null value deletes.
 */

export const PAGES_DEPLOYMENT_ENVS = ["production", "preview"];

/**
 * The PATCH body. `secrets` and `plain` are { KEY: value } (empty values are
 * left alone). `secretEnvs` says which environments get `secrets`: both by
 * default, production only for a project whose previews must not hold them.
 * `previewSecrets` go on the preview environment only and are removed from
 * production (the preview's password gate). `remove` deletes a key only where
 * it is a secret: plain vars come from wrangler.toml [vars] and are not ours
 * to delete. `previewRemove` deletes keys from the preview only; "all" deletes
 * every secret the preview holds.
 */
export function pagesVarsPatch({
  current = {},
  secrets = {},
  plain = {},
  remove = [],
  previewSecrets = {},
  secretEnvs = PAGES_DEPLOYMENT_ENVS,
  previewRemove = [],
}) {
  const deploymentConfigs = {};
  const removed = [];
  for (const deploymentEnv of PAGES_DEPLOYMENT_ENVS) {
    const existing = current[deploymentEnv]?.env_vars || {};
    const envVars = {};
    const previewDrop = previewRemove === "all" ? Object.keys(existing) : previewRemove;
    const drop =
      deploymentEnv === "production" ? [...remove, ...Object.keys(previewSecrets)] : [...remove, ...previewDrop];
    for (const key of drop) {
      if (existing[key]?.type === "secret_text") {
        envVars[key] = null;
        removed.push(`${key} (${deploymentEnv})`);
      }
    }
    for (const [key, value] of Object.entries(plain)) {
      if (value) envVars[key] = { type: "plain_text", value: String(value) };
    }
    const ownSecrets = secretEnvs.includes(deploymentEnv) ? secrets : {};
    const envSecrets = deploymentEnv === "preview" ? { ...ownSecrets, ...previewSecrets } : ownSecrets;
    for (const [key, value] of Object.entries(envSecrets)) {
      if (value) envVars[key] = { type: "secret_text", value: String(value) };
    }
    deploymentConfigs[deploymentEnv] = { env_vars: envVars };
  }
  return { body: { deployment_configs: deploymentConfigs }, removed };
}

/** Apply secrets / plain vars / removals to a project's deployment environments. */
export async function applyPagesVars({
  accountId,
  token,
  project,
  secrets = {},
  plain = {},
  remove = [],
  previewSecrets = {},
  secretEnvs = PAGES_DEPLOYMENT_ENVS,
  previewRemove = [],
  fetchImpl = fetch,
}) {
  if (!accountId || !token) {
    throw new Error("CLOUDFLARE_ACCOUNT_ID and a Cloudflare API token are required.");
  }
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/${project}`;
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  let current = {};
  if (remove.length || previewRemove === "all" || previewRemove.length || Object.keys(previewSecrets).length) {
    const got = await fetchImpl(url, { headers });
    const data = await got.json().catch(() => ({}));
    if (!got.ok || !data.success) {
      throw new Error(`Could not read ${project}: ${JSON.stringify(data.errors || got.status)}`);
    }
    current = data.result?.deployment_configs || {};
  }

  const { body, removed } = pagesVarsPatch({
    current,
    secrets,
    plain,
    remove,
    previewSecrets,
    secretEnvs,
    previewRemove,
  });
  const res = await fetchImpl(url, { method: "PATCH", headers, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) {
    throw new Error(`Could not update ${project}: ${JSON.stringify(data.errors || res.status)}`);
  }
  return {
    secrets: Object.keys(secrets).filter((key) => secrets[key]),
    previewSecrets: Object.keys(previewSecrets).filter((key) => previewSecrets[key]),
    plain: Object.keys(plain).filter((key) => plain[key]),
    removed,
  };
}
