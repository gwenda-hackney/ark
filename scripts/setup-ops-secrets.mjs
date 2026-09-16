/**
 * Set Cloudflare Pages secrets for gwenda-ops (Baserow, Google OAuth, publish).
 * Ops table ids are wrangler [vars], not secrets. Leftover table-id, Auth0,
 * Access, and allowlist secrets are removed.
 *
 * Does not put OPS_PASSWORD on Pages. Local may still use it via .dev.vars.
 *
 * Usage (from repo root):
 *   npm run setup:ops
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveCloudflareDevToken } from "./lib/cloudflare-tokens.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(scriptDir, "..");
const opsDir = join(rootDir, "ops/site");

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

const googleClientId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim();
const googleClientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim();

putSecret("BASEROW_API_KEY", process.env.BASEROW_API_KEY);
putSecret("SANITY_API_TOKEN", process.env.SANITY_API_TOKEN);
putSecret(
  "SITE_DEPLOY_WEBHOOK_URL",
  process.env.SITE_DEPLOY_WEBHOOK_URL || process.env.SANITY_STUDIO_SITE_DEPLOY_URL,
);
putSecret(
  "DEPLOY_WEBHOOK_SECRET",
  process.env.DEPLOY_WEBHOOK_SECRET || process.env.SANITY_STUDIO_SITE_DEPLOY_SECRET,
);
putSecret("OPS_BYPASS_KEY", process.env.OPS_BYPASS_KEY);
putSecret("GOOGLE_OAUTH_CLIENT_ID", googleClientId);
putSecret("GOOGLE_OAUTH_CLIENT_SECRET", googleClientSecret);
putSecret("OPS_SESSION_SECRET", process.env.OPS_SESSION_SECRET);

const LEFTOVER_SECRET_KEYS = [
  "BASEROW_OPS_DATABASE_ID",
  "BASEROW_OPS_SECTIONS_TABLE_ID",
  "BASEROW_OPS_ITEMS_TABLE_ID",
  "BASEROW_OPS_INGREDIENTS_TABLE_ID",
  "BASEROW_OPS_INVENTORY_TABLE_ID",
  "BASEROW_OPS_SUPPLIERS_TABLE_ID",
  "BASEROW_OPS_INVENTORY_SUPPLIERS_TABLE_ID",
  "BASEROW_OPS_USERS_TABLE_ID",
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
  "OPS_PASSWORD",
];

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

console.log(
  "Ops table ids live in ops/site/wrangler.toml [vars], not Pages secrets.",
);
for (const key of LEFTOVER_SECRET_KEYS) deleteSecret(key);

console.log("Done. Production uses Google OAuth + Baserow Users.");
console.log(
  "Leave OPS_PASSWORD unset on Pages. Local can keep it as an optional bypass.",
);
console.log("If Access still intercepts the host: npm run teardown:ops-access");
