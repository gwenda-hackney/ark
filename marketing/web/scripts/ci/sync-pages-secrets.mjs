/**
 * Sync Cloudflare Pages secrets from environment variables.
 * Plain config (table ids, SMTP host/port, invite URLs, copy templates) lives in
 * wrangler.toml [vars] or code defaults — not Pages secrets.
 *
 * Usage:
 *   node scripts/ci/sync-pages-secrets.mjs --project gwenda-staging --profile staging
 *   node scripts/ci/sync-pages-secrets.mjs --project gwenda --profile production
 *   node scripts/ci/sync-pages-secrets.mjs --project gwenda-web-dev --profile dev
 *   ... --if-changed   skip when nothing changed since the last sync (deploys)
 *
 * Every wrangler call takes a second or two, so a full sync is ~1 minute.
 * Pages keeps secrets across deployments, so deploys pass --if-changed: the
 * planned puts and deletes are fingerprinted and compared with the fingerprint
 * saved after the last sync (Gwenda Config, web.pages_secrets_fingerprint).
 */
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { APP_SECRETS } from "../../../../scripts/lib/bitwarden-sm.mjs";
import { getConfigValueFor, setConfigValueFor } from "../../../../shared/config-db.js";

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
const ifChanged = args.includes("--if-changed");
const FINGERPRINT_KEY = "web.pages_secrets_fingerprint";

if (!project || !profile) {
  console.error(
    "Usage: sync-pages-secrets.mjs --project NAME --profile staging|production|dev",
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

/** Planned changes; nothing touches Cloudflare until the plan runs. */
const plan = [];

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
  plan.push({ op: "put", key, value });
}

function applyPut(key, value) {
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
  plan.push({ op: "delete", key });
}

function applyDelete(key) {
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

/** Non-secrets that used to be synced as Pages secrets. Now wrangler [vars] / Sanity / code defaults.
 *  Still ensure SMTP host/user/port exist as plain project vars — deleting them without a
 *  redeploy that reapplies wrangler [vars] breaks form mail (502 after store). */
const LEFTOVER_CONFIG_SECRET_KEYS = [
  "BASEROW_TABLE_ID",
  "BASEROW_DATABASE_ID",
  "SMTP_FROM",
  "SMTP_FROM_EVENTS",
  "INVITE_BASE_URL",
  "INVITE_IMAGE_URL",
  "INVITE_EMAIL_SUBJECT",
  "INVITE_EMAIL_BODY",
  "INVITE_INSTAGRAM_MESSAGE",
];

/** Plain SMTP config that must remain on the Pages project (not secrets). */
const SMTP_PLAIN_VARS = {
  SMTP_HOST: "smtp.gmail.com",
  SMTP_PORT: "587",
  SMTP_USER: "notifications@gwenda.co.uk",
  SMTP_FROM_EVENTS: "Gwenda Events <events@gwenda.co.uk>",
};

async function putPlainSmtpVars() {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
  const token = process.env.CLOUDFLARE_API_TOKEN?.trim();
  if (!accountId || !token) {
    console.warn("Skip SMTP plain vars: CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_TOKEN missing.");
    return;
  }

  const envVars = Object.fromEntries(
    Object.entries(SMTP_PLAIN_VARS).map(([key, value]) => [
      key,
      { type: "plain_text", value },
    ]),
  );

  for (const deploymentEnv of deploymentEnvs) {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/${project}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          deployment_configs: {
            [deploymentEnv]: { env_vars: envVars },
          },
        }),
      },
    );
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body.success) {
      console.error(
        `Failed to set SMTP plain vars on ${project} (${deploymentEnv}):`,
        body.errors || response.status,
      );
      process.exit(1);
    }
    console.log(`Set SMTP plain vars on ${project} (${deploymentEnv}).`);
  }
}

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
    for (const key of STAGING_ONLY_KEYS) deleteSecret(key);
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
for (const key of LEFTOVER_CONFIG_SECRET_KEYS) deleteSecret(key);

/** Values are hashed, never stored. Any change to keys, values or targets changes it. */
const fingerprint = createHash("sha256")
  .update(
    JSON.stringify({
      project,
      profile,
      deploymentEnvs,
      smtp: SMTP_PLAIN_VARS,
      plan: plan.map((step) => [
        step.op,
        step.key,
        step.value == null ? "" : createHash("sha256").update(step.value).digest("hex"),
      ]),
    }),
  )
  .digest("hex");

/** Config Env for this profile's fingerprint row: the dev environment is "local" in config. */
const fingerprintEnv = profile === "dev" ? "local" : profile;

async function storedFingerprint() {
  try {
    return await getConfigValueFor(process.env, "web", FINGERPRINT_KEY, fingerprintEnv);
  } catch (error) {
    console.warn(`Could not read the last secret fingerprint (${error.message}); syncing.`);
    return "";
  }
}

if (ifChanged && (await storedFingerprint()) === fingerprint) {
  console.log(`Pages secrets for ${project} (${profile}) unchanged since the last sync; skipped.`);
  process.exit(0);
}

for (const step of plan) {
  if (step.op === "put") applyPut(step.key, step.value);
  else applyDelete(step.key);
}
await putPlainSmtpVars();
console.log(
  "Plain SMTP host/port/user are project vars; only SMTP_PASSWORD is a Pages secret. Form From/Reply-To live in Sanity.",
);

try {
  await setConfigValueFor(process.env, "web", FINGERPRINT_KEY, fingerprintEnv, fingerprint);
} catch (error) {
  console.warn(`Synced, but could not save the fingerprint (${error.message}); the next deploy syncs again.`);
}
