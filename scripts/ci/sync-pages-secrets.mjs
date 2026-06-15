/**
 * Sync Cloudflare Pages secrets from environment variables.
 * Plain vars (e.g. SITE_ENV) live in wrangler.toml / wrangler.staging.toml and sync on deploy.
 *
 * Usage:
 *   node scripts/ci/sync-pages-secrets.mjs --project gwenda-staging --profile staging
 *   node scripts/ci/sync-pages-secrets.mjs --project gwenda --profile production
 */
import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);

function getArg(name) {
  const idx = args.indexOf(name);
  return idx >= 0 ? args[idx + 1] : undefined;
}

const project = getArg("--project") || process.env.PAGES_PROJECT_NAME;
const profile = getArg("--profile");

if (!project || !profile) {
  console.error(
    "Usage: sync-pages-secrets.mjs --project NAME --profile staging|production",
  );
  process.exit(1);
}

const wrangler = "./node_modules/.bin/wrangler";
const wranglerEnv = {
  ...process.env,
  CLOUDFLARE_API_TOKEN: process.env.CLOUDFLARE_API_TOKEN,
  CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID,
};

/** Pages Functions secrets are scoped per deployment environment. Preview branch deploys need preview secrets. */
const deploymentEnvs = ["production", "preview"];

function putSecret(key, value) {
  if (!value) return;
  for (const deploymentEnv of deploymentEnvs) {
    const result = spawnSync(
      wrangler,
      [
        "pages",
        "secret",
        "put",
        key,
        "--project-name",
        project,
        "--env",
        deploymentEnv,
      ],
      { input: value, encoding: "utf8", env: wranglerEnv },
    );
    if (result.status !== 0) {
      console.error(result.stderr || result.stdout);
      process.exit(result.status || 1);
    }
    console.log(`Set secret ${key} on ${project} (${deploymentEnv}).`);
  }
}

function deleteSecret(key) {
  for (const deploymentEnv of deploymentEnvs) {
    spawnSync(
      wrangler,
      [
        "pages",
        "secret",
        "delete",
        key,
        "--project-name",
        project,
        "--env",
        deploymentEnv,
      ],
      {
        env: wranglerEnv,
        stdio: "inherit",
      },
    );
  }
}

const profiles = {
  staging: () => {
    if (!process.env.SITE_PASSWORD) {
      console.error("SITE_PASSWORD is required for staging deploys.");
      process.exit(1);
    }
    putSecret("SITE_PASSWORD", process.env.SITE_PASSWORD);
    putSecret("GATE_BYPASS_KEY", process.env.GATE_BYPASS_KEY);
    putSecret("BASEROW_API_KEY", process.env.BASEROW_API_KEY);
    putSecret("BASEROW_TABLE_ID", process.env.BASEROW_TABLE_ID);
    putSecret("SUBSCRIBE_SECRET", process.env.SUBSCRIBE_SECRET);
  },
  production: () => {
    for (const key of ["SITE_PASSWORD", "GATE_BYPASS_KEY"]) {
      deleteSecret(key);
    }
    putSecret("BASEROW_API_KEY", process.env.BASEROW_API_KEY);
    putSecret("BASEROW_TABLE_ID", process.env.BASEROW_TABLE_ID);
    putSecret("SUBSCRIBE_SECRET", process.env.SUBSCRIBE_SECRET);
  },
};

const run = profiles[profile];
if (!run) {
  console.error(`Unknown profile: ${profile}`);
  process.exit(1);
}

run();
