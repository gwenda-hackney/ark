/**
 * Set Cloudflare Pages secrets for gwenda-ops (Baserow, Google OAuth, publish).
 * Plain ops settings (Sanity project/dataset, deploy webhook URL, OAuth client id)
 * live in Baserow App Config. Table ids are resolved by name.
 *
 * Loads `.env` then `.env.ark` then `.env.ops` (ops wins). Does not put
 * OPS_LOCAL_ADMIN_PW on Pages.
 * Requires BASEROW_API_KEY_PRODUCTION (prod workspace token). Local
 * BASEROW_API_KEY cannot see production DB 556507.
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
loadEnvFile(resolve(rootDir, ".env.ops"), { override: true });

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

const baserowProductionKey = process.env.BASEROW_API_KEY_PRODUCTION?.trim();
if (!baserowProductionKey) {
  console.error(
    "BASEROW_API_KEY_PRODUCTION is required for Pages. Refusing to fall back to the local BASEROW_API_KEY (that token cannot see production DB 556507).",
  );
  process.exit(1);
}
putSecret("BASEROW_API_KEY", baserowProductionKey);
putSecret("SANITY_API_TOKEN", process.env.SANITY_API_TOKEN);
putSecret(
  "DEPLOY_WEBHOOK_SECRET",
  process.env.DEPLOY_WEBHOOK_SECRET || process.env.SANITY_STUDIO_SITE_DEPLOY_SECRET,
);
putSecret("OPS_BYPASS_KEY", process.env.OPS_BYPASS_KEY);
putSecret("GOOGLE_OAUTH_CLIENT_SECRET", process.env.GOOGLE_OAUTH_CLIENT_SECRET);
putSecret(
  "GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON",
  process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON,
);
putSecret("OPS_SESSION_SECRET", process.env.OPS_SESSION_SECRET);
// LIGHTSPEED_BO_* stay in SM / GitHub for the export Action. Do not put them on Pages.

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

console.log(
  "Ops plain config (Sanity ids, webhook URL, OAuth client id) lives in Baserow App Config.",
);
for (const key of LEFTOVER_SECRET_KEYS) deleteSecret(key);

console.log("Done. Production uses Google OAuth + Baserow Users + App Config.");
console.log(
  "Leave OPS_LOCAL_ADMIN_PW unset on Pages. Local can keep it as an optional bypass in .env.ops.",
);
console.log(
  "Redeploy required for secrets to go live: npm run deploy:production -w @gwenda/ops",
);
console.log("If Access still intercepts the host: npm run teardown:ops-access");
