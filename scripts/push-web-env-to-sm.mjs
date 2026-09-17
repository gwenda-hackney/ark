#!/usr/bin/env node
/**
 * Push filled marketing secrets from repo-root `.env` (and optional `.env.web`)
 * into Bitwarden Secrets Manager.
 *
 * Creates BASEROW_API_KEY_MARKETING from local BASEROW_API_KEY (never overwrites
 * ops BASEROW_API_KEY). Other WEB_ENV_SECRET_KEYS are upserted by the same name.
 *
 *   npm run env:web:push
 *   npm run env:web:push -- --dry-run
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseDotEnv } from "../marketing/web/functions/_lib/env-pem.js";
import {
  DEFAULT_WEB_PROJECT_ID,
  WEB_ENV_SECRET_KEYS,
  resolveSmAccessToken,
  resolveWebProjectId,
  upsertSmSecret,
} from "./lib/bitwarden-sm.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ENV_PATH = resolve(root, ".env");
const WEB_ENV_PATH = resolve(root, ".env.web");

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

/** Prefer `.env.web` then `.env` for a key. */
function localValue(web, shared, key) {
  const fromWeb = String(web.get(key) ?? "").trim();
  if (fromWeb) return fromWeb;
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
    console.log(`Usage: node scripts/push-web-env-to-sm.mjs [--dry-run]

  Upserts filled marketing secrets from .env / .env.web into Secrets Manager.
  BASEROW_API_KEY → SM key BASEROW_API_KEY_MARKETING.
`);
    return;
  }

  const shared = loadDotEnv(ENV_PATH);
  for (const [key, value] of shared) {
    if (!process.env[key]) process.env[key] = value;
  }
  const web = loadDotEnv(WEB_ENV_PATH);

  const token = resolveSmAccessToken();
  if (!token) {
    console.error(
      "Set ARK_LOCAL_BW_TOKEN in repo-root .env (or BWS_ACCESS_TOKEN / ARK_CI_BW_TOKEN).",
    );
    process.exit(1);
  }

  const projectId = resolveWebProjectId();

  /** @type {{ smKey: string, localKey: string, value: string }[]} */
  const planned = [];
  for (const localKey of WEB_ENV_SECRET_KEYS) {
    const value = localValue(web, shared, localKey);
    if (!value) continue;
    const smKey =
      localKey === "BASEROW_API_KEY" ? "BASEROW_API_KEY_MARKETING" : localKey;
    planned.push({ smKey, localKey, value });
  }

  if (!planned.length) {
    console.log("No filled marketing secrets to push.");
    return;
  }

  if (opts.dryRun) {
    console.log(`Would upsert in SM project Ark/Web (${projectId || DEFAULT_WEB_PROJECT_ID}):`);
    for (const row of planned) {
      console.log(`  ${row.smKey} (from local ${row.localKey}, ${row.value.length} chars)`);
    }
    return;
  }

  for (const row of planned) {
    const result = upsertSmSecret({
      key: row.smKey,
      value: row.value,
      accessToken: token,
      projectId,
      note:
        row.smKey === "BASEROW_API_KEY_MARKETING"
          ? "Marketing / subscribe / RSVP Baserow token (not ops Free workspace)"
          : undefined,
    });
    console.log(`${result}: ${row.smKey}`);
  }
  console.log(`Project: Ark/Web (${projectId})`);
}

main();
