#!/usr/bin/env node
/**
 * Pull secrets from Bitwarden Secrets Manager for one env.
 *
 * Every SM secret is `NAME` (shared) or `NAME__DEV|__PRODUCTION` (env
 * override). The override wins. See scripts/lib/bitwarden-sm.mjs.
 *
 *   npm run env:secrets:refresh                   # refetch dev into the RAM cache
 *   npm run env:secrets:refresh -- --profile production   # list resolved/missing names
 *   npm run env:ops:pull -- --github-env          # CI, ops runtime names
 *   npm run env:web:pull -- --github-env          # CI, web runtime names
 *
 * In CI the env defaults to production on release and dev elsewhere (the
 * production GitHub environment only accepts release, #61); --profile wins.
 *
 * Locally nothing is written to the repo: the wrappers (with-env, with-ops-env,
 * ops-dev) load secrets in memory through scripts/lib/load-env.mjs. Without
 * --github-env / --env-only this script refetches that cache (after rotating a
 * secret in the web vault) and reports names, never values.
 * `--github-env` exports one app's runtime names plus the Ark keys.
 *
 * Token: the unlocked vault locally (bw-unlock), BWS_ACCESS_TOKEN in CI.
 */
import { appendFileSync, existsSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import {
  APP_SECRETS,
  SM_TOKEN_HINT,
  appSecrets,
  assertProductionReadable,
  defaultSecretEnv,
  listAllSmSecrets,
  localSecretNames,
  normalizeSecretEnv,
  pickAppSecrets,
  resolveSecretsForEnv,
  resolveSmAccessToken,
  smNameFor,
} from "./lib/bitwarden-sm.mjs";
import { REPO_ROOT, loadLocalSecrets } from "./lib/load-env.mjs";

const LEGACY_FILES = [".env.secrets", ".env.secrets.bak", ".env.ark", ".env.ops", ".env.web"];

function parseArgs(argv) {
  const out = { app: "", dryRun: false, envOnly: false, githubEnv: false, env: "" };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--dry-run") out.dryRun = true;
    else if (arg === "--env-only") out.envOnly = true;
    else if (arg === "--github-env") out.githubEnv = true;
    else if (arg === "--profile" || arg === "--env") {
      out.env = normalizeSecretEnv(argv[i + 1]);
      i += 1;
    } else if (arg === "--help" || arg === "-h") out.help = true;
    else if (!arg.startsWith("-") && !out.app) out.app = arg;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!out.help) {
    if (out.app) appSecrets(out.app);
    if ((out.githubEnv || out.envOnly) && !out.app) {
      throw new Error("--github-env / --env-only need an app (ark, ops or web).");
    }
    if (!out.env) out.env = out.githubEnv ? defaultSecretEnv() : "dev";
  }
  return out;
}

function appendGithubEnv(values) {
  const path = process.env.GITHUB_ENV?.trim();
  if (!path) throw new Error("--github-env requires GITHUB_ENV (GitHub Actions only).");
  for (const [key, value] of values) {
    process.stdout.write(`::add-mask::${value}\n`);
    appendFileSync(path, `${key}<<BW_EOF\n${value}\nBW_EOF\n`);
  }
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log(`Usage: node scripts/pull-app-env-from-sm.mjs <${Object.keys(APP_SECRETS).join("|")}> [options]

  Without --github-env / --env-only: refetch this machine's (dev) secrets into the RAM cache
  that with-env / with-ops-env / ops-dev read (other profiles: list names only).

  --profile|--env dev|production
                 dev by default; with --github-env: production on release, else dev
  --dry-run      List resolved and missing keys (no values, no cache write)
  --env-only     Print KEY=value lines; do not write files
  --github-env   Append resolved secrets (plus Ark keys) to $GITHUB_ENV
`);
    return;
  }

  if (opts.env === "dev" && !opts.dryRun && !opts.githubEnv && !opts.envOnly) {
    refreshLocalCache();
    return;
  }

  const accessToken = resolveSmAccessToken();
  if (!accessToken) {
    console.error(SM_TOKEN_HINT);
    process.exit(1);
  }

  const raw = listAllSmSecrets({ accessToken });
  if (opts.env === "production") assertProductionReadable(raw);
  const resolved = resolveSecretsForEnv(raw, opts.env);

  if (opts.githubEnv || opts.envOnly) {
    const { values, missing } = pickAppSecrets(opts.app, resolved);
    if (missing.length) {
      console.log(`Missing in SM: ${missing.map((key) => smNameFor(opts.app, key)).join(", ")}`);
    }
    if (opts.envOnly) {
      for (const [key, value] of values) process.stdout.write(`${key}=${value}\n`);
      return;
    }
    const ark = opts.app === "ark" ? null : pickAppSecrets("ark", resolved);
    const all = new Map([...(ark?.values ?? []), ...values]);
    if (!all.size) throw new Error("No secrets resolved from Secrets Manager. Check BWS_ACCESS_TOKEN.");
    appendGithubEnv(all);
    console.log(`App ${opts.app}, env ${opts.env}: appended ${all.size} secrets to GITHUB_ENV.`);
    return;
  }

  const names = localSecretNames();
  const missing = names.filter((name) => !resolved.get(name));
  console.log(`Env ${opts.env}: ${names.length - missing.length} secrets resolved.`);
  if (missing.length) console.log(`Missing in SM: ${missing.join(", ")}`);
}

function refreshLocalCache() {
  const { values, missing } = loadLocalSecrets({ refresh: true });
  if (!values) {
    console.error(`Vault locked. ${SM_TOKEN_HINT}`);
    process.exit(1);
  }
  console.log(`Env dev: ${values.size} secrets cached in memory (/dev/shm).`);
  if (missing.length) console.log(`Missing in SM: ${missing.join(", ")}`);
  for (const name of LEGACY_FILES) {
    const path = resolve(REPO_ROOT, name);
    if (!existsSync(path)) continue;
    rmSync(path);
    console.log(`Deleted ${name} (no longer used).`);
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
