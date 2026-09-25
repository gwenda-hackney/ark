/**
 * Cloudflare Pages project variables through the API: one GET and one PATCH
 * per project. `wrangler pages secret put` sends the same PATCH, but one
 * process per key per environment (~1.5s each), so a full sync took 1–2.5
 * minutes. The PATCH merges into what is there; a null value deletes.
 */

export const PAGES_DEPLOYMENT_ENVS = ["production", "preview"];

/**
 * The PATCH body. `secrets` and `plain` are { KEY: value } (empty values are
 * left alone). `remove` deletes a key only where it is a secret: plain vars
 * come from wrangler.toml [vars] and are not ours to delete.
 */
export function pagesVarsPatch({ current = {}, secrets = {}, plain = {}, remove = [] }) {
  const deploymentConfigs = {};
  const removed = [];
  for (const deploymentEnv of PAGES_DEPLOYMENT_ENVS) {
    const existing = current[deploymentEnv]?.env_vars || {};
    const envVars = {};
    for (const key of remove) {
      if (existing[key]?.type === "secret_text") {
        envVars[key] = null;
        removed.push(`${key} (${deploymentEnv})`);
      }
    }
    for (const [key, value] of Object.entries(plain)) {
      if (value) envVars[key] = { type: "plain_text", value: String(value) };
    }
    for (const [key, value] of Object.entries(secrets)) {
      if (value) envVars[key] = { type: "secret_text", value: String(value) };
    }
    deploymentConfigs[deploymentEnv] = { env_vars: envVars };
  }
  return { body: { deployment_configs: deploymentConfigs }, removed };
}

/** Apply secrets / plain vars / removals to both deployment environments of a project. */
export async function applyPagesVars({
  accountId,
  token,
  project,
  secrets = {},
  plain = {},
  remove = [],
  fetchImpl = fetch,
}) {
  if (!accountId || !token) {
    throw new Error("CLOUDFLARE_ACCOUNT_ID and a Cloudflare API token are required.");
  }
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/${project}`;
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  let current = {};
  if (remove.length) {
    const got = await fetchImpl(url, { headers });
    const data = await got.json().catch(() => ({}));
    if (!got.ok || !data.success) {
      throw new Error(`Could not read ${project}: ${JSON.stringify(data.errors || got.status)}`);
    }
    current = data.result?.deployment_configs || {};
  }

  const { body, removed } = pagesVarsPatch({ current, secrets, plain, remove });
  const res = await fetchImpl(url, { method: "PATCH", headers, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) {
    throw new Error(`Could not update ${project}: ${JSON.stringify(data.errors || res.status)}`);
  }
  return {
    secrets: Object.keys(secrets).filter((key) => secrets[key]),
    plain: Object.keys(plain).filter((key) => plain[key]),
    removed,
  };
}
