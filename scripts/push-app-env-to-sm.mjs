#!/usr/bin/env node
/**
 * Push secrets into Secrets Manager. Name the keys; each value comes from the
 * shell under the name given, else from .env (delete the line once pushed).
 * Each key goes to its owning project under its SM name. Keys may be given as
 * the app's runtime name, the SM name, or a script-only secret the app's
 * project owns (SECRET_OWNERS, e.g. ark's SENTRY_AUTH_TOKEN).
 *
 *   SUBSCRIBE_SECRET=... npm run env:web:push -- SUBSCRIBE_SECRET   # shared value
 *   SUBSCRIBE_SECRET=... npm run env:web:push -- --dry-run SUBSCRIBE_SECRET
 *   npm run env:ops:push -- --profile dev BASEROW_API_KEY   # BASEROW_OPS_API_KEY__DEV
 *
 * Without --profile a key is pushed as the shared NAME; a PRODUCTION_ONLY key
 * always goes as NAME__PRODUCTION. Keys that already have
 * env overrides in SM are skipped unless --profile is given, so a dev token
 * never becomes the shared value for every env.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseDotEnv } from "../shared/env-file.js";
import { REPO_ROOT } from "./lib/load-env.mjs";
import {
  APP_SECRETS,
  PRODUCTION_ONLY,
  SECRET_OWNERS,
  SM_TOKEN_HINT,
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
  if (!out.help) {
    appSecrets(out.app);
    if (!out.only.length) throw new Error("Name the keys to push; each value comes from the shell.");
  }
  return out;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log(`Usage: node scripts/push-app-env-to-sm.mjs <${Object.keys(APP_SECRETS).join("|")}> [--profile dev|production] [--dry-run] KEY...

  Each KEY's value comes from the shell: KEY=... npm run env:<app>:push -- KEY`);
    return;
  }

  const accessToken = resolveSmAccessToken();
  if (!accessToken) {
    console.error(SM_TOKEN_HINT);
    process.exit(1);
  }

  const spec = APP_SECRETS[opts.app];
  const runtimeFor = (key) =>
    spec.keys.includes(key) ? key : spec.keys.find((k) => smNameFor(opts.app, k) === key);
  /** Script-only secrets this app's project owns: stored under their own name. */
  const scriptOnly = (key) => (SECRET_OWNERS[opts.app] || []).includes(key) && !runtimeFor(key);
  const dotEnvPath = resolve(REPO_ROOT, ".env");
  const dotEnv = new Map(existsSync(dotEnvPath) ? parseDotEnv(readFileSync(dotEnvPath, "utf8")) : []);
  const existingKeys = [...listAllSmSecrets({ accessToken }).keys()];
  const hasOverrides = (name) =>
    existingKeys.some((key) => {
      const parsed = parseSecretKey(key);
      return parsed.name === name && parsed.env !== null;
    });

  for (const arg of opts.only) {
    const key = runtimeFor(arg) || (scriptOnly(arg) ? arg : undefined);
    if (!key) {
      console.log(`skip ${arg}: not an ${opts.app} secret`);
      continue;
    }
    const smName = scriptOnly(key) ? key : smNameFor(opts.app, key);
    const fromShell = String(process.env[arg] ?? "").trim();
    const value = fromShell || String(dotEnv.get(arg) ?? "").trim();
    if (!value) {
      console.log(`skip ${arg}: no value in the shell or .env (${arg}=... npm run env:${opts.app}:push -- ${arg})`);
      continue;
    }
    if (!ownerOf(smName)) {
      console.log(`skip ${key}: ${smName} has no owning project`);
      continue;
    }
    const env = PRODUCTION_ONLY.includes(smName) ? "production" : opts.env;
    if (!env && hasOverrides(smName)) {
      console.log(`skip ${key}: ${smName} has env overrides in SM. Pass --profile.`);
      continue;
    }
    const target = envSecretKey(smName, env);
    if (opts.dryRun) {
      console.log(`would upsert ${target} (${ownerOf(smName)}) from ${key}`);
      continue;
    }
    console.log(`${upsertSmSecret({ key: target, value, accessToken })}: ${target}`);
    if (!fromShell) console.log(`  from .env: delete the ${arg} line there now.`);
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
