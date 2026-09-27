/**
 * Set Cloudflare Pages secrets for gwenda-ops from Secrets Manager (env=production).
 * Keys come from APP_SECRETS.ops (minus pagesSkip). Plain settings live in the
 * Baserow config database (docs/config.md).
 *
 * Needs ARK_LOCAL_BW_TOKEN (local .env) or BWS_ACCESS_TOKEN (CI), plus a
 * Cloudflare token from Secrets Manager (bw-unlock) / the job env.
 *
 * One Cloudflare API request (scripts/lib/pages-vars.mjs), not a wrangler
 * call per key.
 *
 * Pages snapshots secrets per deployment: after this script, run
 * `npm run deploy -w @gwenda/ops` (or deploy:production) or the new secret
 * will not be live on operations.gwenda.co.uk.
 *
 * Prod ops (gwenda-ops) gets its secrets on the production environment only:
 * its preview environment must never hold them, because branch previews are
 * unreviewed code. Branch previews run on gwenda-ops-dev, whose production
 * and preview environments both get the dev secrets.
 *
 * Usage (from repo root):
 *   npm run setup:ops
 *   node scripts/setup-ops-secrets.mjs --project gwenda-ops-dev --env dev   # dev ops
 *   node scripts/setup-ops-secrets.mjs --clear-preview   # also delete prod ops secrets left on its preview
 */
import { APP_SECRETS, loadAppSecretsFromSm } from "./lib/bitwarden-sm.mjs";
import { loadRepoEnv } from "./lib/load-env.mjs";
import { applyPagesVars } from "./lib/pages-vars.mjs";

loadRepoEnv({ override: true });

function argValue(name, fallback) {
  const i = process.argv.indexOf(name);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

/** Prod ops by default; dev ops is gwenda-ops-dev with the dev secrets. */
const project = argValue("--project", "gwenda-ops");
const secretEnv = argValue("--env", "production");
const isProd = project === "gwenda-ops";
if (isProd && secretEnv !== "production") {
  console.error("gwenda-ops only takes production secrets.");
  process.exit(1);
}
const clearPreview = process.argv.includes("--clear-preview");
if (clearPreview && !isProd) {
  console.error("--clear-preview is for gwenda-ops only: dev previews need the dev secrets.");
  process.exit(1);
}
const token = process.env.CLOUDFLARE_API_TOKEN?.trim();
if (!token) {
  console.error("CLOUDFLARE_API_TOKEN is required.");
  process.exit(1);
}

const { values, missing } = loadAppSecretsFromSm("ops", secretEnv);
if (!values.get("BASEROW_API_KEY")) {
  console.error(`SM BASEROW_OPS_API_KEY__${secretEnv.toUpperCase()} is required for Pages.`);
  process.exit(1);
}
const skip = new Set(APP_SECRETS.ops.pagesSkip);
const secrets = {};
for (const key of APP_SECRETS.ops.keys) {
  if (skip.has(key)) continue;
  if (values.get(key)) secrets[key] = values.get(key);
  else console.log(`Skip ${key} (not set).`);
}
if (missing.length) console.log(`Not in SM (left as-is on Pages): ${missing.join(", ")}`);

try {
  const done = await applyPagesVars({
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
    token,
    project,
    secrets,
    secretEnvs: isProd ? ["production"] : ["production", "preview"],
    previewRemove: clearPreview ? "all" : [],
  });
  const where = isProd ? "production" : "production, preview";
  console.log(`Set ${done.secrets.length} secrets on ${project} (${where}): ${done.secrets.join(", ")}.`);
  if (clearPreview) {
    console.log(
      done.removed.length
        ? `Removed from the preview: ${done.removed.join(", ")}.`
        : "The preview held no ops secrets.",
    );
  }
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

console.log("Done. Plain ops settings live in the Baserow config database.");
console.log(
  "Leave OPS_LOCAL_ADMIN_PW unset on Pages. Local keeps it in Secrets Manager.",
);
console.log(
  "Redeploy required for secrets to go live: npm run deploy:production -w @gwenda/ops",
);
console.log("If Access still intercepts the host: npm run teardown:ops-access");
