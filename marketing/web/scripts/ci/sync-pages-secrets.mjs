/**
 * Sync Cloudflare Pages secrets from environment variables.
 * Plain config (table ids, invite URLs, copy templates) lives in wrangler.toml
 * [vars] or code defaults — not Pages secrets.
 *
 * Usage:
 *   node scripts/ci/sync-pages-secrets.mjs --project gwenda-staging --profile staging
 *   node scripts/ci/sync-pages-secrets.mjs --project gwenda --profile production
 *   node scripts/ci/sync-pages-secrets.mjs --project gwenda-web-dev --profile dev
 *
 * One Cloudflare API request per project (scripts/lib/pages-vars.mjs), so
 * every deploy syncs.
 */
import { APP_SECRETS } from "../../../../scripts/lib/bitwarden-sm.mjs";
import { applyPagesVars } from "../../../../scripts/lib/pages-vars.mjs";

const args = process.argv.slice(2);

function getArg(name) {
  const idx = args.indexOf(name);
  return idx >= 0 ? args[idx + 1] : undefined;
}

const project = getArg("--project") || process.env.PAGES_PROJECT_NAME;
const profile = getArg("--profile");

if (!project || !profile) {
  console.error(
    "Usage: sync-pages-secrets.mjs --project NAME --profile staging|production|dev",
  );
  process.exit(1);
}

const secrets = {};
const remove = [];

function putSecret(key, value) {
  if (!value) {
    if (key === "SMTP_PASSWORD") {
      console.warn(
        "SMTP_PASSWORD is empty in the environment; leaving existing Pages secret unchanged.",
      );
    }
    return;
  }
  if (key === "SMTP_PASSWORD") {
    const cleaned = String(value).replace(/\s+/g, "");
    if (cleaned.length !== 16) {
      console.warn(
        `SMTP_PASSWORD length is ${cleaned.length} after stripping spaces (expected 16 for a Google app password).`,
      );
    }
    value = cleaned;
  }
  secrets[key] = value;
}

/** Plain SMTP config that must remain on the Pages project (not secrets). */
const SMTP_PLAIN_VARS = {
  SMTP_HOST: "smtp.gmail.com",
  SMTP_PORT: "587",
  SMTP_USER: "notifications@gwenda.co.uk",
  SMTP_FROM_EVENTS: "Gwenda Events <events@gwenda.co.uk>",
};

/** Staging-gate secrets: put on staging, removed from production. */
const STAGING_ONLY_KEYS = new Set(["SITE_PASSWORD", "GATE_BYPASS_KEY"]);

/** Every web secret from `npm run env:web:pull -- --github-env --profile <profile>`. */
function putSharedSecrets() {
  const skip = new Set(APP_SECRETS.web.pagesSkip);
  for (const key of APP_SECRETS.web.keys) {
    if (STAGING_ONLY_KEYS.has(key) || skip.has(key)) continue;
    putSecret(key, process.env[key]);
  }
  putSecret("APPLE_WALLET_PASS_TYPE_ID", process.env.APPLE_WALLET_PASS_TYPE_ID);
  putSecret("APPLE_WALLET_TEAM_ID", process.env.APPLE_WALLET_TEAM_ID);
  putSecret("APPLE_WALLET_SIGNER_CERT", process.env.APPLE_WALLET_SIGNER_CERT);
  putSecret("APPLE_WALLET_SIGNER_KEY", process.env.APPLE_WALLET_SIGNER_KEY);
  putSecret("APPLE_WALLET_WWDR_CERT", process.env.APPLE_WALLET_WWDR_CERT);
  putSecret(
    "APPLE_WALLET_SIGNER_KEY_PASSPHRASE",
    process.env.APPLE_WALLET_SIGNER_KEY_PASSPHRASE,
  );
}

const profiles = {
  staging: () => {
    if (!process.env.SITE_PASSWORD) {
      console.error("SITE_PASSWORD is required for staging deploys.");
      process.exit(1);
    }
    for (const key of STAGING_ONLY_KEYS) putSecret(key, process.env[key]);
    putSharedSecrets();
  },
  production: () => {
    remove.push(...STAGING_ONLY_KEYS);
    putSharedSecrets();
  },
  // Like staging: gated. Form notifications go to the dev inbox
  // (forms.notify_email for Env=local), never the form's real address.
  dev: () => {
    if (!process.env.SITE_PASSWORD) {
      console.error("SITE_PASSWORD is required for dev deploys.");
      process.exit(1);
    }
    for (const key of STAGING_ONLY_KEYS) putSecret(key, process.env[key]);
    putSharedSecrets();
  },
};

const run = profiles[profile];
if (!run) {
  console.error(`Unknown profile: ${profile}`);
  process.exit(1);
}

run();

try {
  const done = await applyPagesVars({
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID?.trim(),
    token: process.env.CLOUDFLARE_API_TOKEN?.trim(),
    project,
    secrets,
    plain: SMTP_PLAIN_VARS,
    remove,
  });
  console.log(`Set ${done.secrets.length} secrets on ${project} (production, preview): ${done.secrets.join(", ")}.`);
  for (const key of done.removed) console.log(`Removed secret ${key} from ${project}.`);
  console.log(
    "Plain SMTP host/port/user are project vars; only SMTP_PASSWORD is a Pages secret. Form From/Reply-To live in Sanity.",
  );
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
