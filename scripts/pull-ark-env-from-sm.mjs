#!/usr/bin/env node
/**
 * Pull org Cloudflare secrets from Bitwarden Secrets Manager (Ark) → `.env.ark`.
 *
 * Bootstrap (shared `.env` only):
 *   ARK_LOCAL_BW_TOKEN   machine-account access token (ark-local)
 *
 *   npm run env:ark:pull
 *   npm run env:ark:pull -- --dry-run
 *   npm run env:ark:pull -- --env-only
 *   npm run env:ark:pull -- --github-env
 */
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseDotEnv } from "../marketing/web/functions/_lib/env-pem.js";
import {
  ARK_ENV_SECRET_KEYS,
  formatArkEnv,
  listSmSecrets,
  pickArkSecrets,
  resolveArkProjectId,
  resolveSmAccessToken,
} from "./lib/bitwarden-sm.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ENV_PATH = resolve(root, ".env");
const ARK_ENV_PATH = resolve(root, ".env.ark");

function loadDotEnv(path) {
  if (!existsSync(path)) return new Map();
  return new Map(parseDotEnv(readFileSync(path, "utf8")));
}

function parseArgs(argv) {
  const out = { dryRun: false, envOnly: false, githubEnv: false };
  for (const arg of argv) {
    if (arg === "--dry-run") out.dryRun = true;
    else if (arg === "--env-only") out.envOnly = true;
    else if (arg === "--github-env") out.githubEnv = true;
    else if (arg === "--help" || arg === "-h") out.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return out;
}

function appendGithubEnv(fromArk) {
  const path = process.env.GITHUB_ENV?.trim();
  if (!path) {
    throw new Error("--github-env requires GITHUB_ENV (GitHub Actions only).");
  }
  let n = 0;
  for (const key of ARK_ENV_SECRET_KEYS) {
    const value = fromArk.get(key);
    if (value == null || !String(value).trim()) continue;
    process.stdout.write(`::add-mask::${String(value)}\n`);
    appendFileSync(path, `${key}<<BW_EOF\n${value}\nBW_EOF\n`);
    n += 1;
  }
  return n;
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
    console.log(`Usage: node scripts/pull-ark-env-from-sm.mjs [--dry-run] [--env-only] [--github-env]

  --dry-run      List keys that would sync (no write, no values)
  --env-only     Print KEY=value lines to stdout; do not write .env.ark
  --github-env   Append filled secrets to $GITHUB_ENV
`);
    return;
  }

  const shared = loadDotEnv(ENV_PATH);
  for (const [key, value] of shared) {
    if (!process.env[key]) process.env[key] = value;
  }

  const token = resolveSmAccessToken();
  if (!token) {
    console.error(
      "Set ARK_LOCAL_BW_TOKEN in repo-root .env (or BWS_ACCESS_TOKEN / ARK_CI_BW_TOKEN).",
    );
    process.exit(1);
  }

  const projectId = resolveArkProjectId();
  const all = listSmSecrets({ accessToken: token, projectId });
  const fromSm = pickArkSecrets(all);
  const existing = loadDotEnv(ARK_ENV_PATH);
  const ark = new Map();
  for (const key of ARK_ENV_SECRET_KEYS) {
    if (fromSm.has(key) && String(fromSm.get(key) ?? "").trim()) {
      ark.set(key, fromSm.get(key));
    } else if (existing.has(key)) {
      ark.set(key, existing.get(key) ?? "");
    } else {
      ark.set(key, fromSm.get(key) ?? "");
    }
  }
  const missing = ARK_ENV_SECRET_KEYS.filter(
    (key) => !fromSm.has(key) || !String(fromSm.get(key) ?? "").trim(),
  );
  const fromSmFilled = ARK_ENV_SECRET_KEYS.filter(
    (key) => fromSm.has(key) && String(fromSm.get(key) ?? "").trim(),
  );

  if (opts.dryRun) {
    console.log(`Would write ${ARK_ENV_PATH}`);
    console.log(`SM project: Ark (${projectId})`);
    console.log(`From SM: ${fromSmFilled.join(", ") || "(none)"}`);
    if (missing.length) {
      console.log(`Missing in SM (keep local if present): ${missing.join(", ")}`);
    }
    return;
  }

  if (opts.githubEnv) {
    console.log(
      `SM project Ark (${projectId}): filled ${fromSmFilled.join(", ") || "(none)"}`,
    );
    const n = appendGithubEnv(ark);
    console.log(`Appended ${n} secrets to GITHUB_ENV (from SM).`);
    if (n === 0) {
      throw new Error(
        "No Ark secrets were loaded from Secrets Manager into GITHUB_ENV. Check BWS_ACCESS_TOKEN access to the Ark project.",
      );
    }
    return;
  }

  if (opts.envOnly) {
    for (const key of ARK_ENV_SECRET_KEYS) {
      const value = ark.get(key);
      if (value == null || !String(value).trim()) continue;
      process.stdout.write(`${key}=${value}\n`);
    }
    return;
  }

  writeFileSync(ARK_ENV_PATH, formatArkEnv(ark));
  console.log(`Wrote ${ARK_ENV_PATH}`);
  console.log(`Synced from SM: ${fromSmFilled.join(", ") || "(none)"}`);
  if (missing.length) {
    console.log(
      `Not in SM yet: ${missing.join(", ")}. Add via npm run env:ark:push or Secrets Manager.`,
    );
  }
}

main();
