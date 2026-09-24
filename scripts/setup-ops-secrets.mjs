/**
 * Set Cloudflare Pages secrets for gwenda-ops from Secrets Manager (env=production).
 * Keys come from APP_SECRETS.ops (minus pagesSkip). Plain settings live in the
 * Baserow config database (docs/config.md).
 *
 * Needs ARK_LOCAL_BW_TOKEN (local .env) or BWS_ACCESS_TOKEN (CI), plus a
 * Cloudflare token from `.env.ark` / the job env.
 *
 * Pages snapshots secrets per deployment: after this script, run
 * `npm run deploy -w @gwenda/ops` (or deploy:production) or the new secret
 * will not be live on operations.gwenda.co.uk.
 *
 * Usage (from repo root):
 *   npm run setup:ops
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveCloudflareDevToken } from "./lib/cloudflare-tokens.mjs";
import { APP_SECRETS, loadAppSecretsFromSm } from "./lib/bitwarden-sm.mjs";
import { parseDotEnv } from "../marketing/web/functions/_lib/env-pem.js";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(scriptDir, "..");
const opsDir = join(rootDir, "ops/site");

function loadEnvFile(path, { override = false } = {}) {
  if (!existsSync(path)) return;
  for (const [key, value] of parseDotEnv(readFileSync(path, "utf8"))) {
    if (override || !process.env[key]) process.env[key] = value;
  }
}

loadEnvFile(resolve(rootDir, ".env"), { override: false });
loadEnvFile(resolve(rootDir, ".env.ark"), { override: true });

function findWrangler() {
  for (const base of [opsDir, rootDir]) {
    const bin = join(base, "node_modules/wrangler/bin/wrangler.js");
    if (existsSync(bin)) return bin;
  }
  return null;
}

const wrangler = findWrangler();
if (!wrangler) {
  console.error("wrangler not found. Run npm ci at the repo root.");
  process.exit(1);
}

const project = "gwenda-ops";
const deploymentEnvs = ["production", "preview"];
const wranglerEnv = {
  ...process.env,
  CLOUDFLARE_API_TOKEN: resolveCloudflareDevToken(),
  CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID,
};

if (!wranglerEnv.CLOUDFLARE_API_TOKEN) {
  console.error("CLOUDFLARE_DEV_API_TOKEN (or legacy CLOUDFLARE_API_TOKEN) is required.");
  process.exit(1);
}

function putSecret(key, value) {
  if (!value) {
    console.log(`Skip ${key} (not set).`);
    return;
  }
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
      { input: value, encoding: "utf8", env: wranglerEnv, cwd: opsDir },
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
      { input: "y\n", encoding: "utf8", env: wranglerEnv, cwd: opsDir },
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

const { values, missing } = loadAppSecretsFromSm("ops", "production");
if (!values.get("BASEROW_API_KEY")) {
  console.error("SM BASEROW_OPS_API_KEY__PRODUCTION is required for Pages.");
  process.exit(1);
}
const skip = new Set(APP_SECRETS.ops.pagesSkip);
for (const key of APP_SECRETS.ops.keys) {
  if (!skip.has(key)) putSecret(key, values.get(key));
}
if (missing.length) console.log(`Not in SM (left as-is on Pages): ${missing.join(", ")}`);

const LEFTOVER_SECRET_KEYS = [
  "BASEROW_OPS_DATABASE_ID",
  "BASEROW_OPS_SECTIONS_TABLE_ID",
  "BASEROW_OPS_ITEMS_TABLE_ID",
  "BASEROW_OPS_INGREDIENTS_TABLE_ID",
  "BASEROW_OPS_INVENTORY_TABLE_ID",
  "BASEROW_OPS_SUPPLIERS_TABLE_ID",
  "BASEROW_OPS_INVENTORY_SUPPLIERS_TABLE_ID",
  "BASEROW_OPS_USERS_TABLE_ID",
  "BASEROW_OPS_CONFIG_TABLE_ID",
  "SANITY_PROJECT_ID",
  "SANITY_DATASET",
  "SITE_DEPLOY_WEBHOOK_URL",
  "SANITY_STUDIO_SITE_DEPLOY_URL",
  "GOOGLE_OAUTH_CLIENT_ID",
  "AUTH0_DOMAIN",
  "AUTH0_CLIENT_ID",
  "AUTH0_CLIENT_SECRET",
  "AUTH0_AUDIENCE",
  "AUTH0_CONNECTION",
  "AUTH0_ALLOWED_EMAILS",
  "OPS_ALLOWED_EMAILS",
  "OPS_AUTH_MODE",
  "OPS_DEV_ACCESS_EMAIL",
  "OPS_DEV_ACCESS_SECRET",
  "CF_ACCESS_GOOGLE_CLIENT_ID",
  "CF_ACCESS_GOOGLE_CLIENT_SECRET",
  "OPS_LOCAL_ADMIN_PW",
  "OPS_PASSWORD",
];

for (const key of LEFTOVER_SECRET_KEYS) deleteSecret(key);

console.log("Done. Plain ops settings live in the Baserow config database.");
console.log(
  "Leave OPS_LOCAL_ADMIN_PW unset on Pages. Local can keep it as an optional bypass in .env.ops.",
);
console.log(
  "Redeploy required for secrets to go live: npm run deploy:production -w @gwenda/ops",
);
console.log("If Access still intercepts the host: npm run teardown:ops-access");
