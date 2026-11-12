#!/usr/bin/env node
/**
 * Local ops: run Pages Functions on :8788, Vite ops SPA on :5174.
 *
 * Loads repo-root `.env` plus secrets from the unlocked vault under ops runtime
 * names (secrets win). `wrangler pages dev` only reads bindings from
 * `.dev.vars` (it ignores --env-file), so `.dev.vars` is a symlink to a per-run
 * file in the RAM secrets directory; both are removed on exit.
 * Non-secret ops settings come from the Baserow config database at runtime.
 *
 *   npm run ops:dev
 *   npm run ops:prod    debug against PRODUCTION (see below)
 *
 * Plain `dev` works exactly like hosted ops (Save, Update website) against
 * copies: the dev D1 databases (over the Cloudflare API) and the Gwenda Dev
 * Sanity project (drafts and
 * published, like the real one). Nothing it does can reach gwenda.co.uk. Refresh
 * the copy with `npm run dev:refresh:sanity`.
 *
 * --live runs the same local app with production powers: production Ops DB,
 * production secrets from Secrets Manager, SITE_ENV=production. "Update
 * website", "Update website now" and saves act on the real website, exactly
 * like hosted ops. Use it to reproduce and fix production problems with local
 * stack traces. The app shows a red "LOCAL COPY ON LIVE DATA" banner.
 *
 * Sign-in: plain dev signs you in as yourself, without Google. It binds
 * OPS_LOCAL_SIGN_IN to FORMS_NOTIFY_EMAIL (your git email unless .env says
 * otherwise), and the ops users list still decides whether you get in. The
 * server honours it only with SITE_ENV=local and no OPS_LOCAL_LIVE
 * (localSignInEmail in ops/site/src/access/server/auth.js), so a deployed ops
 * never does. --live keeps Google sign-in, like production.
 */
import { spawn } from "node:child_process";
import { rmSync, symlinkSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { APP_SECRETS } from "./lib/bitwarden-sm.mjs";
import { loadRepoEnv } from "./lib/load-env.mjs";
import { writeRuntimeEnvFile } from "./lib/secrets-cache.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OPS_DIR = resolve(ROOT, "ops/site");
const DEV_VARS_PATH = resolve(OPS_DIR, ".dev.vars");

/** Secrets + config fills Wrangler binds for the Functions. */
/**
 * What the local Functions get: every ops runtime key (APP_SECRETS, the same
 * list Pages gets, so a new secret reaches local dev too) plus local-only ones.
 */
const DEV_VAR_KEYS = [
  ...new Set([
    ...APP_SECRETS.ops.keys,
    "GOOGLE_OAUTH_CLIENT_ID",
    "GOOGLE_CALENDAR_ID_LOCAL",
    // Where form emails resent from /forms go on this machine.
    "FORMS_NOTIFY_EMAIL",
    // Optional env overrides (normally config database):
    "SANITY_PROJECT_ID",
    "SANITY_DATASET",
    "SITE_DEPLOY_WEBHOOK_URL",
    "SANITY_STUDIO_SITE_DEPLOY_URL",
    "GOOGLE_CALENDAR_ID",
  ]),
];

const LIVE = process.argv.includes("--live");

function googleReady() {
  return Boolean(
    process.env.GOOGLE_OAUTH_CLIENT_ID?.trim() &&
      process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim() &&
      process.env.OPS_SESSION_SECRET?.trim(),
  );
}

/** Who plain dev signs in: the email main() already required (missingLocalSettings). */
function localSignInEmail() {
  const email = process.env.FORMS_NOTIFY_EMAIL?.trim();
  if (!email) throw new Error("FORMS_NOTIFY_EMAIL is missing: set your git email (git config user.email).");
  return email;
}

function loadRootEnv() {
  loadRepoEnv({ app: "ops", override: true });
}

/**
 * Local ops must use the Gwenda Dev Sanity project, with a token for it
 * (SANITY_API_TOKEN__DEV in Secrets Manager).
 */
async function useDevSanityProject() {
  const { DEV_SANITY_PROJECT_ID } = await import("../shared/sanity-projects.js");
  process.env.SANITY_PROJECT_ID = DEV_SANITY_PROJECT_ID;
  const token = process.env.SANITY_API_TOKEN?.trim();
  const response = token
    ? await fetch(`https://${DEV_SANITY_PROJECT_ID}.api.sanity.io/v2025-01-01/users/me`, {
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => null)
    : null;
  if (!response?.ok) {
    console.warn(
      `SANITY_API_TOKEN does not open the Gwenda Dev Sanity project (${DEV_SANITY_PROJECT_ID}). ` +
        "Saves will fail until SANITY_API_TOKEN__DEV in Secrets Manager holds its token; then npm run env:secrets:refresh.",
    );
  }
}

/** Production ops secrets (runtime names) straight from Secrets Manager. */
async function loadProductionSecrets() {
  const {
    listAllSmSecrets,
    pickAppSecrets,
    resolveSecretsForEnv,
    resolveSmAccessToken,
  } = await import("./lib/bitwarden-sm.mjs");
  const resolved = resolveSecretsForEnv(
    listAllSmSecrets({ accessToken: resolveSmAccessToken() }),
    "production",
  );
  const { values, missing } = pickAppSecrets("ops", resolved);
  if (missing.length) console.warn(`Production secrets missing: ${missing.join(", ")}`);
  for (const [key, value] of values) process.env[key] = value;
}

/**
 * Bindings for `wrangler pages dev`: DEV_VAR_KEYS plus SITE_ENV and how you
 * sign in (OPS_LOCAL_SIGN_IN, or OPS_LOCAL_LIVE for --live), written to a
 * RAM env file that `.dev.vars` points at. The Cloudflare token and account
 * are bound too: local Functions reach D1 over the API (D1_OVER_API), since
 * the bindings wrangler gives them here are empty local databases.
 * @returns {string} env file path
 */
function writeBindings() {
  const bindings = new Map();
  for (const key of DEV_VAR_KEYS) {
    const value = process.env[key]?.trim();
    if (value) bindings.set(key, value);
  }
  bindings.set("SITE_ENV", LIVE ? "production" : "local");
  // The D1 bindings are empty local databases here: reach the environment's
  // real ones over the API instead (shared/d1-env.js), with its own token.
  bindings.set("D1_OVER_API", "1");
  for (const key of ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID"]) {
    const value = process.env[key]?.trim();
    if (!value)
      throw new Error(`${key} is missing: local ops reaches its databases over the Cloudflare API. Run bw-unlock.`);
    bindings.set(key, value);
  }
  if (LIVE) {
    // Production data: Google sign-in, as on hosted production.
    bindings.set("OPS_LOCAL_LIVE", "1");
    if (!googleReady()) {
      throw new Error(
        "ops:prod signs in with Google: GOOGLE_OAUTH_CLIENT_ID/SECRET and OPS_SESSION_SECRET are missing. Run bw-unlock.",
      );
    }
  } else {
    // The dev copies: signed in as yourself (see the header).
    bindings.set("OPS_LOCAL_SIGN_IN", localSignInEmail());
  }
  const file = writeRuntimeEnvFile("ops-dev.env", bindings);
  rmSync(DEV_VARS_PATH, { force: true });
  symlinkSync(file, DEV_VARS_PATH);
  return file;
}

async function main() {
  loadRootEnv();

  if (!LIVE) {
    const { missingLocalSettings } = await import("../shared/config.js");
    // Ops resends the website's form emails, so it needs the web ones too.
    const missing = missingLocalSettings(
      { ...process.env, SITE_ENV: "local" },
      { services: ["ops", "web"] },
    );
    if (missing.length) {
      throw new Error(
        `Set your git email (git config user.email you@example.com), or these in the repo .env:\n${missing
          .map((row) => `  ${row.env}=  (${row.hint}, for ${row.key})`)
          .join("\n")}`,
      );
    }
  }

  if (LIVE) {
    await loadProductionSecrets();
    // Repo .env points local work at the dev Sanity project; live is the real one.
    const { REAL_SANITY_PROJECT_ID } = await import("../shared/sanity-projects.js");
    process.env.SANITY_PROJECT_ID = REAL_SANITY_PROJECT_ID;
    console.warn(`
  ************************************************************
  *  LIVE MODE: this local ops uses PRODUCTION data.         *
  *  Saves, "Update website" and "Update website now" change *
  *  the real Ops DB and gwenda.co.uk.                        *
  ************************************************************
`);
  } else {
    // No database check needed: a dev machine gets BASEROW_OPS_API_KEY__DEV,
    // a token that only opens the Gwenda Dev workspace.
    await useDevSanityProject();
  }

  // Pull plain settings (e.g. Google client id) from config when missing in env.
  if (process.env.BASEROW_CONFIG_API_KEY?.trim()) {
    try {
      const { applyOpsAppConfig } = await import(
        "../ops/site/src/platform/config-store.js"
      );
      const merged = await applyOpsAppConfig({
        ...process.env,
        SITE_ENV: LIVE ? "production" : "local",
      });
      for (const key of [
        "GOOGLE_OAUTH_CLIENT_ID",
        "GOOGLE_CALENDAR_ID",
        "SANITY_PROJECT_ID",
        "SANITY_DATASET",
        "SITE_DEPLOY_WEBHOOK_URL",
        "SANITY_STUDIO_SITE_DEPLOY_URL",
      ]) {
        if (!process.env[key]?.trim() && merged[key]) {
          process.env[key] = merged[key];
        }
      }
      console.log("Merged ops config into local env (non-secrets).");
    } catch (error) {
      console.warn(
        `Config not loaded (${error instanceof Error ? error.message : error}). Using env only.`,
      );
    }
  }
  const bindingsFile = writeBindings();
  const removeBindings = () => {
    rmSync(DEV_VARS_PATH, { force: true });
    rmSync(bindingsFile, { force: true });
  };
  process.on("exit", removeBindings);
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
    process.on(signal, () => process.exit(130));
  }
  try {
    const { resolveOpsTableIds } = await import("../shared/baserow.js");
    const { databaseId } = await resolveOpsTableIds(process.env);
    console.log(`Baserow Ops DB ${databaseId} (${LIVE ? "Gwenda, PRODUCTION" : "Gwenda Dev"} token)`);
  } catch (error) {
    console.warn(`Baserow Ops DB not reachable: ${error instanceof Error ? error.message : error}`);
  }

  const children = [];

  function run(command, args, cwd, name) {
    const child = spawn(command, args, {
      cwd,
      stdio: "inherit",
      env: process.env,
      shell: process.platform === "win32",
    });
    child.on("exit", (code, signal) => {
      for (const other of children) {
        if (other !== child && !other.killed) other.kill("SIGTERM");
      }
      process.exit(code ?? (signal ? 1 : 0));
    });
    children.push(child);
    console.log(`[ops-dev] started ${name}`);
    return child;
  }

  // Wrangler (:8788) serves Functions and public/ (the gate, icons); Vite
  // (:5174) serves the live app with HMR and proxies /api to Wrangler.
  console.log(`
Ops local:
  SPA (HMR):       http://localhost:5174/
  Pages + auth:    http://localhost:8788/
  Auth:            ${
    LIVE
      ? "Google sign-in + ops users list (same as production)"
      : `signed in as ${localSignInEmail()}, if on the ops users list (no Google)`
  }
`);

  run(
    "npx",
    ["wrangler", "pages", "dev", "public", "--ip", "0.0.0.0", "--port", "8788"],
    OPS_DIR,
    "wrangler",
  );
  run("npx", ["vite", "--host", "0.0.0.0"], OPS_DIR, "vite");

  function shutdown() {
    for (const child of children) {
      if (!child.killed) child.kill("SIGTERM");
    }
  }
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
