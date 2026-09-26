/**
 * Sync Cloudflare Pages secrets from environment variables.
 * Plain config (table ids, invite URLs, copy templates) lives in wrangler.toml
 * [vars] or code defaults — not Pages secrets.
 *
 * Usage:
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
    "Usage: sync-pages-secrets.mjs --project NAME --profile production|dev",
  );
  process.exit(1);
}

const secrets = {};
const previewSecrets = {};

function putSecret(key, value) {
  if (value) secrets[key] = value;
}

/**
 * Secrets no code reads any more, deleted from the project on each sync.
 * SMTP_PASSWORD: mail goes through the Gmail API (shared/gmail-send.js).
 */
const RETIRED_SECRETS = ["SMTP_PASSWORD"];

/** The password gate: on every preview, never on the live site. */
const GATE_KEYS = new Set(["SITE_PASSWORD", "GATE_BYPASS_KEY"]);

/** Every web secret from `npm run env:web:pull -- --github-env --profile <profile>`. */
function putSharedSecrets() {
  const skip = new Set(APP_SECRETS.web.pagesSkip);
  for (const key of APP_SECRETS.web.keys) {
    if (GATE_KEYS.has(key) || skip.has(key)) continue;
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
  // The live site is open; its preview (the project's preview environment)
  // is gated. Without a password the preview refuses visitors (site-auth.js).
  production: () => {
    if (!process.env.SITE_PASSWORD) {
      console.warn(
        "SITE_PASSWORD is empty: the preview stays closed until it is set.",
      );
    }
    for (const key of GATE_KEYS) {
      if (process.env[key]) previewSecrets[key] = process.env[key];
    }
    putSharedSecrets();
  },
  // Both dev sites are gated. Form notifications go to the dev inbox
  // (forms.notify_email for Env=dev), never the form's real address.
  dev: () => {
    if (!process.env.SITE_PASSWORD) {
      console.error("SITE_PASSWORD is required for dev deploys.");
      process.exit(1);
    }
    for (const key of GATE_KEYS) putSecret(key, process.env[key]);
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
    remove: RETIRED_SECRETS,
    previewSecrets,
  });
  console.log(
    `Set ${done.secrets.length} secrets on ${project} (production, preview): ${done.secrets.join(", ")}.`,
  );
  if (done.previewSecrets.length) {
    console.log(
      `Set ${done.previewSecrets.join(", ")} on ${project} (preview only).`,
    );
  }
  for (const key of done.removed)
    console.log(`Removed secret ${key} from ${project}.`);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
