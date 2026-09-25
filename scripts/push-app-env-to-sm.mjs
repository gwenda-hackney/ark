#!/usr/bin/env node
/**
 * Push filled secrets into Secrets Manager. Values come from `.env.secrets`
 * (SM names), or from the shell for keys named on the command line. Each key goes to its owning project under its SM name.
 * Keys may be given as the app's runtime name or the SM name.
 *
 *   npm run env:web:push -- --dry-run
 *   npm run env:web:push -- SUBSCRIBE_SECRET          # shared value
 *   NEW_SECRET=... npm run env:web:push -- NEW_SECRET  # value from the shell
 *   npm run env:ops:push -- --profile local BASEROW_API_KEY   # BASEROW_OPS_API_KEY__LOCAL
 *
 * Without --profile a key is pushed as the shared NAME. Keys that already have
 * env overrides in SM are skipped unless --profile is given, so a local token
 * never becomes the shared value for every env.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseDotEnv } from "../marketing/web/functions/_lib/env-pem.js";
import {
  APP_SECRETS,
  LOCAL_SECRETS_FILE,
  appSecrets,
  envSecretKey,
  listAllSmSecrets,
  normalizeSecretEnv,
  ownerOf,
  parseSecretKey,
  resolveSmAccessToken,
  smNameFor,
  upsertSmSecret,
} from "./lib/bitwarden-sm.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function loadDotEnv(path) {
  if (!existsSync(path)) return new Map();
  return new Map(parseDotEnv(readFileSync(path, "utf8")));
}

function parseArgs(argv) {
  const out = { app: "", env: "", dryRun: false, only: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--dry-run") out.dryRun = true;
    else if (arg === "--profile" || arg === "--env") {
      out.env = normalizeSecretEnv(argv[i + 1]);
      i += 1;
    } else if (arg === "--help" || arg === "-h") out.help = true;
    else if (arg.startsWith("-")) throw new Error(`Unknown argument: ${arg}`);
    else if (!out.app) out.app = arg;
    else out.only.push(arg);
  }
  if (!out.help) appSecrets(out.app);
  return out;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log(`Usage: node scripts/push-app-env-to-sm.mjs <${Object.keys(APP_SECRETS).join("|")}> [--profile local|staging|production] [--dry-run] [KEY...]`);
    return;
  }

  const shell = new Map(Object.entries(process.env));
  for (const [key, value] of loadDotEnv(resolve(root, ".env"))) {
    if (!process.env[key]) process.env[key] = value;
  }
  const accessToken = resolveSmAccessToken();
  if (!accessToken) {
    console.error("Set ARK_LOCAL_BW_TOKEN in repo-root .env (or BWS_ACCESS_TOKEN).");
    process.exit(1);
  }

  const spec = APP_SECRETS[opts.app];
  const local = loadDotEnv(resolve(root, LOCAL_SECRETS_FILE));
  const runtimeFor = (key) =>
    spec.keys.includes(key) ? key : spec.keys.find((k) => smNameFor(opts.app, k) === key);
  const existingKeys = [...listAllSmSecrets({ accessToken }).keys()];
  const hasOverrides = (name) =>
    existingKeys.some((key) => {
      const parsed = parseSecretKey(key);
      return parsed.name === name && parsed.env !== null;
    });

  const keys = opts.only.length ? opts.only : spec.keys;
  for (const arg of keys) {
    const key = runtimeFor(arg);
    if (!key) {
      console.log(`skip ${arg}: not an ${opts.app} secret`);
      continue;
    }
    const smName = smNameFor(opts.app, key);
    const fromShell = opts.only.length ? shell.get(arg) : undefined;
    const value = String(fromShell ?? local.get(smName) ?? "").trim();
    if (!value) continue;
    if (!ownerOf(smName)) {
      console.log(`skip ${key}: ${smName} has no owning project`);
      continue;
    }
    if (!opts.env && hasOverrides(smName)) {
      console.log(`skip ${key}: ${smName} has env overrides in SM. Pass --profile.`);
      continue;
    }
    const target = envSecretKey(smName, opts.env);
    if (opts.dryRun) {
      console.log(`would upsert ${target} (${ownerOf(smName)}) from ${key}`);
      continue;
    }
    console.log(`${upsertSmSecret({ key: target, value, accessToken })}: ${target}`);
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
