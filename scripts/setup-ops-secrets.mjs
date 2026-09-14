/**
 * Set Cloudflare Pages secrets for gwenda-ops (Baserow menu recipes + publish).
 * Does not rotate OPS_PASSWORD.
 *
 * Usage (from repo root):
 *   npm run setup:ops
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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
  console.error("wrangler not found — run npm ci at the repo root.");
  process.exit(1);
}

const project = "gwenda-ops";
const deploymentEnvs = ["production", "preview"];
const wranglerEnv = {
  ...process.env,
  CLOUDFLARE_API_TOKEN: process.env.CLOUDFLARE_API_TOKEN,
  CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID,
};

if (!wranglerEnv.CLOUDFLARE_API_TOKEN) {
  console.error("CLOUDFLARE_API_TOKEN is required.");
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

putSecret("BASEROW_API_KEY", process.env.BASEROW_API_KEY);
putSecret("BASEROW_OPS_DATABASE_ID", process.env.BASEROW_OPS_DATABASE_ID);
putSecret("BASEROW_OPS_SECTIONS_TABLE_ID", process.env.BASEROW_OPS_SECTIONS_TABLE_ID);
putSecret("BASEROW_OPS_ITEMS_TABLE_ID", process.env.BASEROW_OPS_ITEMS_TABLE_ID);
putSecret(
  "BASEROW_OPS_INGREDIENTS_TABLE_ID",
  process.env.BASEROW_OPS_INGREDIENTS_TABLE_ID,
);
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

console.log("Done. OPS_PASSWORD is unchanged.");
