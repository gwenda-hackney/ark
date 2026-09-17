/**
 * Sync Cloudflare Pages secrets from environment variables.
 * Plain config (table ids, SMTP host/port, invite URLs, copy templates) lives in
 * wrangler.toml [vars] or code defaults — not Pages secrets.
 *
 * Usage:
 *   node scripts/ci/sync-pages-secrets.mjs --project gwenda-staging --profile staging
 *   node scripts/ci/sync-pages-secrets.mjs --project gwenda --profile production
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const webDir = resolve(scriptDir, "../..");
const rootDir = resolve(webDir, "../..");

function findWrangler() {
  for (const base of [webDir, rootDir]) {
    const bin = join(base, "node_modules/wrangler/bin/wrangler.js");
    if (existsSync(bin)) return bin;
  }
  return null;
}

const wrangler = findWrangler();
if (!wrangler) {
  console.error("wrangler not found — run npm ci at the repo root.");
  process.exit(1);
}

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
      process.execPath,
      [
        wrangler,
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
    if (result.error) {
      console.error(`wrangler pages secret put ${key} failed: ${result.error.message}`);
      process.exit(1);
    }
    if (result.status !== 0) {
      const message = [result.stderr, result.stdout].filter(Boolean).join("\n");
      console.error(message || `wrangler pages secret put ${key} failed (exit ${result.status})`);
      process.exit(result.status || 1);
    }
    console.log(`Set secret ${key} on ${project} (${deploymentEnv}).`);
  }
}

function deleteSecret(key) {
  for (const deploymentEnv of deploymentEnvs) {
    const result = spawnSync(
      process.execPath,
      [
        wrangler,
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
        input: "y\n",
        encoding: "utf8",
        env: wranglerEnv,
      },
    );
    if (result.status === 0) {
      console.log(`Removed leftover secret ${key} on ${project} (${deploymentEnv}).`);
      continue;
    }
    const message = [result.stderr, result.stdout].filter(Boolean).join("\n").trim();
    console.log(
      `Leave ${key} (${deploymentEnv}): ${message || "not present or wrangler declined"}.`,
    );
  }
}

/** Non-secrets that used to be synced as Pages secrets. Now wrangler [vars] / code defaults. */
const LEFTOVER_CONFIG_SECRET_KEYS = [
  "BASEROW_TABLE_ID",
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_FROM_EVENTS",
  "INVITE_BASE_URL",
  "INVITE_IMAGE_URL",
  "INVITE_EMAIL_SUBJECT",
  "INVITE_EMAIL_BODY",
  "INVITE_INSTAGRAM_MESSAGE",
];

function putSharedSecrets() {
  putSecret("BASEROW_API_KEY", process.env.BASEROW_API_KEY);
  putSecret("SUBSCRIBE_SECRET", process.env.SUBSCRIBE_SECRET);
  putSecret("EVENT_ADMIN_SECRET", process.env.EVENT_ADMIN_SECRET);
  putSecret("SANITY_API_TOKEN", process.env.SANITY_API_TOKEN);
  putSecret("SMTP_USER", process.env.SMTP_USER);
  putSecret("SMTP_PASSWORD", process.env.SMTP_PASSWORD);
  putSecret("SMTP_FROM", process.env.SMTP_FROM);
  putSecret("APPLE_WALLET_PASS_TYPE_ID", process.env.APPLE_WALLET_PASS_TYPE_ID);
  putSecret("APPLE_WALLET_TEAM_ID", process.env.APPLE_WALLET_TEAM_ID);
  putSecret("APPLE_WALLET_SIGNER_CERT", process.env.APPLE_WALLET_SIGNER_CERT);
  putSecret("APPLE_WALLET_SIGNER_KEY", process.env.APPLE_WALLET_SIGNER_KEY);
  putSecret("APPLE_WALLET_WWDR_CERT", process.env.APPLE_WALLET_WWDR_CERT);
  putSecret(
    "APPLE_WALLET_SIGNER_KEY_PASSPHRASE",
    process.env.APPLE_WALLET_SIGNER_KEY_PASSPHRASE,
  );
  putSecret("INSTAGRAM_ACCESS_TOKEN", process.env.INSTAGRAM_ACCESS_TOKEN);
  putSecret("INSTAGRAM_BUSINESS_ACCOUNT_ID", process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID);
}

const profiles = {
  staging: () => {
    if (!process.env.SITE_PASSWORD) {
      console.error("SITE_PASSWORD is required for staging deploys.");
      process.exit(1);
    }
    putSecret("SITE_PASSWORD", process.env.SITE_PASSWORD);
    putSecret("GATE_BYPASS_KEY", process.env.GATE_BYPASS_KEY);
    putSharedSecrets();
  },
  production: () => {
    for (const key of ["SITE_PASSWORD", "GATE_BYPASS_KEY"]) {
      deleteSecret(key);
    }
    putSharedSecrets();
  },
};

const run = profiles[profile];
if (!run) {
  console.error(`Unknown profile: ${profile}`);
  process.exit(1);
}

run();

console.log(
  "Plain config (BASEROW_TABLE_ID, SMTP host/port, invite URLs) lives in wrangler [vars].",
);
for (const key of LEFTOVER_CONFIG_SECRET_KEYS) deleteSecret(key);
