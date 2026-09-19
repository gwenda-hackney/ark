#!/usr/bin/env node
/**
 * Push filled org Cloudflare secrets from `.env.ark` (then `.env`) into
 * Bitwarden Secrets Manager project Ark.
 *
 *   npm run env:ark:push
 *   npm run env:ark:push -- --dry-run
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseDotEnv } from "../marketing/web/functions/_lib/env-pem.js";
import {
  ARK_ENV_SECRET_KEYS,
  DEFAULT_ARK_PROJECT_ID,
  resolveArkProjectId,
  resolveSmAccessToken,
  upsertSmSecret,
} from "./lib/bitwarden-sm.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ENV_PATH = resolve(root, ".env");
const ARK_ENV_PATH = resolve(root, ".env.ark");

function loadDotEnv(path) {
  if (!existsSync(path)) return new Map();
  return new Map(parseDotEnv(readFileSync(path, "utf8")));
}

function parseArgs(argv) {
  const out = { dryRun: false };
  for (const arg of argv) {
    if (arg === "--dry-run") out.dryRun = true;
    else if (arg === "--help" || arg === "-h") out.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return out;
}

/** Prefer `.env.ark` then `.env` for a key. */
function localValue(ark, shared, key) {
  const fromArk = String(ark.get(key) ?? "").trim();
  if (fromArk) return fromArk;
  return String(shared.get(key) ?? "").trim();
}

function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
  if (opts.help) {
    console.log(`Usage: node scripts/push-ark-env-to-sm.mjs [--dry-run]

  Upserts filled Cloudflare secrets from .env.ark / .env into Secrets Manager Ark.
`);
    return;
  }

  const shared = loadDotEnv(ENV_PATH);
  for (const [key, value] of shared) {
    if (!process.env[key]) process.env[key] = value;
  }
  const ark = loadDotEnv(ARK_ENV_PATH);

  const token = resolveSmAccessToken();
  if (!token) {
    console.error(
      "Set ARK_LOCAL_BW_TOKEN in repo-root .env (or BWS_ACCESS_TOKEN / ARK_CI_BW_TOKEN).",
    );
    process.exit(1);
  }

  const projectId = resolveArkProjectId();

  /** @type {{ key: string, value: string }[]} */
  const planned = [];
  for (const key of ARK_ENV_SECRET_KEYS) {
    const value = localValue(ark, shared, key);
    if (!value) continue;
    planned.push({ key, value });
  }

  if (!planned.length) {
    console.log("No filled Ark Cloudflare secrets to push.");
    return;
  }

  if (opts.dryRun) {
    console.log(`Would upsert in SM project Ark (${projectId || DEFAULT_ARK_PROJECT_ID}):`);
    for (const row of planned) {
      console.log(`  ${row.key} (${row.value.length} chars)`);
    }
    return;
  }

  for (const row of planned) {
    const result = upsertSmSecret({
      key: row.key,
      value: row.value,
      accessToken: token,
      projectId,
      note:
        row.key === "CLOUDFLARE_DEV_API_TOKEN"
          ? "Local Wrangler / Pages DEV token"
          : row.key === "CLOUDFLARE_API_TOKEN"
            ? "CI / Wrangler Cloudflare API token"
            : "Cloudflare account id",
    });
    console.log(`${result}: ${row.key}`);
  }
  console.log(`Project: Ark (${projectId})`);
}

main();
