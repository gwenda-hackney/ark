/**
 * Load the repo env into process.env.
 *
 * `.env` is optional: personal overrides only. FORMS_NOTIFY_EMAIL defaults to
 * your git email (`git config user.email`), and
 * LOCAL_DEFAULTS below point a developer machine at the dev copies, like the
 * hosted dev site. Secrets are never written
 * to the repo: after `bw-unlock` they come from Secrets Manager (env `dev`)
 * into memory, through a look-aside cache in /dev/shm (scripts/lib/secrets-cache.mjs).
 * Pass `app` to also expose that app's runtime names (APP_SECRETS rename), e.g.
 * web gets BASEROW_API_KEY from BASEROW_WEBSITE_API_KEY, ops from BASEROW_OPS_API_KEY.
 *
 * In CI (`CI` set) SM is not read here: jobs export secrets with `--github-env`.
 *
 * `.env` never overrides the shell. `override` lets secrets override the shell,
 * which app wrappers use so a stale export cannot shadow the vault value.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseDotEnv } from "../../marketing/web/functions/_lib/env-pem.js";
import { VAULT_ONLY_KEYS, loadPersistedSession } from "./bitwarden-env.mjs";
import {
  APP_SECRETS,
  SM_TOKEN_HINT,
  listAllSmSecrets,
  localSecretNames,
  resolveSecretsForEnv,
  resolveSmAccessToken,
} from "./bitwarden-sm.mjs";
import { readSecretsCache, writeSecretsCache } from "./secrets-cache.mjs";

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

/**
 * A developer machine works on the dev copies, like the hosted dev site
 * (marketing/web/wrangler.dev.toml). Only when unset; never in CI.
 */
const LOCAL_DEFAULTS = {
  SANITY_PROJECT_ID: "gwscpagy", // Gwenda Dev (ops/site/functions/_lib/sanity.js DEV_SANITY_PROJECT_ID)
  SANITY_DATASET: "production",
  INVITE_BASE_URL: "http://localhost:4321",
};

/** This checkout's git email (`git config user.email`), or "". */
function gitEmail() {
  try {
    return execFileSync("git", ["config", "user.email"], { cwd: REPO_ROOT, encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

/** Old plaintext copies this loader replaced. */
const LEGACY_SECRET_FILES = [".env.secrets", ".env.secrets.bak"];

function setEnv(key, value, override) {
  if (value === undefined || value === "") return;
  if (override || !process.env[key]) process.env[key] = value;
}

function applyDotEnv() {
  const path = resolve(REPO_ROOT, ".env");
  if (!existsSync(path)) return;
  for (const [key, value] of parseDotEnv(readFileSync(path, "utf8"))) {
    setEnv(key, value, false);
    if (VAULT_ONLY_KEYS.includes(key) && value) {
      console.warn(`${key} is in .env. Delete that line; it is read from the unlocked vault.`);
    }
  }
}

/** What the cache entry is tied to: an explicit token, else the bw session. */
function cacheBinding() {
  const token = process.env.ARK_LOCAL_BW_TOKEN?.trim();
  if (token) return token;
  loadPersistedSession();
  return process.env.BW_SESSION?.trim() || "";
}

/**
 * Local secrets under SM names, from the cache or Secrets Manager.
 * @param {{ refresh?: boolean }} [options] refresh skips the cache
 * @returns {{ values: Map<string, string> | null, source?: "cache" | "sm", missing?: string[] }}
 */
export function loadLocalSecrets({ refresh = false } = {}) {
  const binding = cacheBinding();
  if (!binding) return { values: null };
  if (!refresh) {
    const cached = readSecretsCache("dev", binding);
    if (cached) return { values: cached, source: "cache", missing: [] };
  }
  const accessToken = resolveSmAccessToken();
  if (!accessToken) return { values: null };
  const resolved = resolveSecretsForEnv(listAllSmSecrets({ accessToken }), "dev");
  const values = new Map();
  const missing = [];
  for (const name of localSecretNames()) {
    const value = resolved.get(name);
    if (value) values.set(name, value);
    else missing.push(name);
  }
  writeSecretsCache("dev", binding, values);
  return { values, source: "sm", missing };
}

function applySecrets(override) {
  if (process.env.CI) return false;
  const legacy = LEGACY_SECRET_FILES.filter((name) => existsSync(resolve(REPO_ROOT, name)));
  if (legacy.length) {
    console.warn(`No longer read, delete: ${legacy.join(", ")} (secrets load from the vault).`);
  }
  let values;
  try {
    ({ values } = loadLocalSecrets({ refresh: Boolean(process.env.ARK_SECRETS_REFRESH) }));
  } catch (error) {
    console.warn(
      `Secrets not loaded from Secrets Manager: ${error instanceof Error ? error.message : error}`,
    );
    return false;
  }
  if (!values) {
    console.warn(`Secrets not loaded: vault locked. ${SM_TOKEN_HINT}`);
    return false;
  }
  for (const [key, value] of values) setEnv(key, value, override);
  return true;
}

/**
 * @param {{ app?: "ark" | "ops" | "web", override?: boolean }} [options]
 * @returns {{ secrets: boolean }} whether local secrets were loaded
 */
export function loadRepoEnv({ app, override = false } = {}) {
  applyDotEnv();
  if (!process.env.CI) {
    for (const [key, value] of Object.entries(LOCAL_DEFAULTS)) setEnv(key, value, false);
    // Form emails from your local site go to you: your git email unless .env says otherwise.
    setEnv("FORMS_NOTIFY_EMAIL", gitEmail(), false);
  }
  const secrets = applySecrets(override);
  if (app) {
    const spec = APP_SECRETS[app];
    if (!spec) throw new Error(`Unknown app "${app}".`);
    for (const [runtime, smName] of Object.entries(spec.rename)) {
      setEnv(runtime, process.env[smName], override);
    }
  }
  return { secrets };
}
