#!/usr/bin/env node
/**
 * Wire event invites + RSVP ops: GitHub secrets/vars, Baserow table check, optional seeds.
 *
 * Usage:
 *   npm run setup:event-ops
 *   npm run setup:event-ops -- --production-baserow   # create prod Event Invites table (JWT)
 *   npm run setup:event-ops -- --seed-events-dev
 *   npm run setup:event-ops -- --deploy-studio-prod
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_BASEROW_API,
  DEV_BASEROW_DATABASE_ID,
  PRODUCTION_SUBSCRIBE_TABLE_ID,
  RSVP_TABLE_NAME,
} from "../web/functions/_lib/baserow.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ENV_PATH = resolve(ROOT, ".env");

const GITHUB_SECRET_KEYS = [
  "EVENT_ADMIN_SECRET",
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_USER",
  "SMTP_PASSWORD",
  "SMTP_FROM",
  "SMTP_FROM_EVENTS",
  "INSTAGRAM_ACCESS_TOKEN",
  "INSTAGRAM_BUSINESS_ACCOUNT_ID",
  "INVITE_BASE_URL",
  "INVITE_IMAGE_URL",
  "INVITE_EMAIL_SUBJECT",
  "INVITE_EMAIL_BODY",
  "INVITE_INSTAGRAM_MESSAGE",
];

const DEFAULT_INVITE_SECRETS = {
  INVITE_BASE_URL: "https://gwenda.co.uk",
  INVITE_IMAGE_URL: "https://gwenda.co.uk/images/event-invite.jpg",
};

const flags = new Set(process.argv.slice(2));

function loadDotEnv() {
  if (!existsSync(ENV_PATH)) {
    throw new Error(`Missing ${ENV_PATH}`);
  }

  const env = {};
  for (const line of readFileSync(ENV_PATH, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
    if (process.env[key] === undefined) process.env[key] = value;
  }
  return env;
}

function run(command, args, { input, quiet = false } = {}) {
  const result = spawnSync(command, args, {
    input,
    encoding: "utf8",
    stdio: quiet ? ["pipe", "pipe", "pipe"] : "inherit",
  });
  if (result.status !== 0) {
    const detail = [result.stderr, result.stdout].filter(Boolean).join("\n").trim();
    throw new Error(detail || `${command} ${args.join(" ")} failed`);
  }
  return result.stdout ?? "";
}

function repoSlug() {
  return run("gh", ["repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner"], {
    quiet: true,
  }).trim();
}

function setGhSecret(name, value) {
  run("gh", ["secret", "set", name, "--repo", repoSlug()], { input: value, quiet: true });
  console.log(`  ✓ GitHub secret ${name}`);
}

function setGhVariable(name, value) {
  run(
    "gh",
    [
      "api",
      "-X",
      "PATCH",
      `repos/${repoSlug()}/actions/variables/${name}`,
      "-f",
      `name=${name}`,
      "-f",
      `value=${value}`,
    ],
    { quiet: true },
  );
  console.log(`  ✓ GitHub variable ${name}`);
}

function createGhVariable(name, value) {
  try {
    setGhVariable(name, value);
  } catch {
    run(
      "gh",
      [
        "api",
        "-X",
        "POST",
        `repos/${repoSlug()}/actions/variables`,
        "-f",
        `name=${name}`,
        "-f",
        `value=${value}`,
      ],
      { quiet: true },
    );
    console.log(`  ✓ GitHub variable ${name} (created)`);
  }
}

function ensureEventAdminSecret(env) {
  if (env.EVENT_ADMIN_SECRET?.trim()) return env.EVENT_ADMIN_SECRET.trim();
  console.log("Generating EVENT_ADMIN_SECRET…");
  run("npm", ["run", "setup:event-admin"], { quiet: false });
  const refreshed = loadDotEnv();
  if (!refreshed.EVENT_ADMIN_SECRET?.trim()) {
    throw new Error("EVENT_ADMIN_SECRET was not written to .env");
  }
  return refreshed.EVENT_ADMIN_SECRET.trim();
}

async function listBaserowTables(apiKey, apiBase = DEFAULT_BASEROW_API) {
  const response = await fetch(`${apiBase}/api/database/tables/all-tables/`, {
    headers: { Authorization: `Token ${apiKey}` },
  });
  if (!response.ok) {
    throw new Error(`Baserow table list failed (${response.status})`);
  }
  return response.json();
}

function reportBaserowTables(tables) {
  const invites = tables.filter((table) => table.name === RSVP_TABLE_NAME);
  console.log(`\nBaserow "${RSVP_TABLE_NAME}" tables:`);
  if (invites.length === 0) {
    console.log("  (none — run npm run setup:baserow-rsvp)");
    return { invites, prodDatabaseId: null };
  }

  for (const table of invites) {
    console.log(`  • id ${table.id} — database ${table.database_id}`);
    console.log(`    https://baserow.io/database/${table.database_id}/table/${table.id}/`);
  }

  const prodSubscribe = tables.find(
    (table) => String(table.id) === PRODUCTION_SUBSCRIBE_TABLE_ID,
  );
  const prodDatabaseId = prodSubscribe ? String(prodSubscribe.database_id) : null;
  if (prodDatabaseId) {
    const prodInvite = invites.find((table) => String(table.database_id) === prodDatabaseId);
    if (!prodInvite) {
      console.log(
        `\nProduction database ${prodDatabaseId} has no "${RSVP_TABLE_NAME}" table yet.`,
      );
      console.log("  Run: npm run setup:baserow-rsvp -- --production");
    }
  }

  return { invites, prodDatabaseId };
}

function syncGithub(env) {
  console.log("Syncing GitHub secrets and variables…");
  run("gh", ["auth", "status"], { quiet: true });

  const secretValues = { ...DEFAULT_INVITE_SECRETS };
  for (const key of GITHUB_SECRET_KEYS) {
    if (env[key]?.trim()) secretValues[key] = env[key].trim();
  }
  secretValues.EVENT_ADMIN_SECRET = ensureEventAdminSecret(env);

  for (const [key, value] of Object.entries(secretValues)) {
    if (value) setGhSecret(key, value);
  }

  if (env.BASEROW_RSVP_GRID_URL?.trim()) {
    createGhVariable("BASEROW_RSVP_GRID_URL", env.BASEROW_RSVP_GRID_URL.trim());
  }

  const missing = GITHUB_SECRET_KEYS.filter(
    (key) => !secretValues[key] && !DEFAULT_INVITE_SECRETS[key],
  );
  if (missing.length) {
    console.log("\nOptional secrets not set (invite email / Instagram will stay disabled):");
    for (const key of missing) console.log(`  • ${key}`);
  }
}

async function main() {
  const env = loadDotEnv();
  syncGithub(env);

  const apiKey = env.BASEROW_API_KEY?.trim();
  if (apiKey) {
    const tables = await listBaserowTables(apiKey);
    reportBaserowTables(tables);
  } else {
    console.log("\nBASEROW_API_KEY missing — skipped Baserow table check.");
  }

  if (flags.has("--production-baserow")) {
    console.log("\nCreating production Event Invites table…");
    run("node", ["--env-file=.env", "scripts/setup-baserow-rsvp.mjs", "--production"], {
      quiet: false,
    });
  }

  if (flags.has("--seed-events-dev")) {
    console.log("\nSeeding development events…");
    run("npm", ["run", "studio:seed:events:dev"], { quiet: false });
  }

  if (flags.has("--deploy-studio-prod")) {
    console.log("\nDeploying production Studio…");
    run("gh", ["workflow", "run", "Deploy production Studio"], { quiet: false });
  }

  console.log("\nDone. Re-deploy staging/production to sync Cloudflare Pages secrets.");
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
