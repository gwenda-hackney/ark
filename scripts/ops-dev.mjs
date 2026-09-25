#!/usr/bin/env node
/**
 * Local ops: write .dev.vars, run Pages Functions on :8788, Vite ops SPA on :5174.
 *
 * Loads repo-root `.env` plus `.env.secrets` under ops runtime names (secrets win).
 * Non-secret ops settings come from the Baserow config database at runtime.
 *
 *   npm run ops:dev
 *   npm run ops:prod    debug against PRODUCTION (see below)
 *
 * Plain `dev` works exactly like hosted ops (Save, Update website) against
 * copies: the dev Ops DB and the Gwenda Dev Sanity project (its own staging
 * and production datasets). Nothing it does can reach gwenda.co.uk. Refresh
 * the copy with `npm run dev:refresh:sanity`.
 *
 * --live runs the same local app with production powers: production Ops DB,
 * production secrets from Secrets Manager, SITE_ENV=production. "Update
 * website", "Update website now" and saves act on the real website, exactly
 * like hosted ops. Use it to reproduce and fix production problems with local
 * stack traces. The app shows a red "LOCAL COPY ON LIVE DATA" banner.
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadRepoEnv } from "./lib/load-env.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OPS_DIR = resolve(ROOT, "ops/site");
const MENU_APP = resolve(OPS_DIR, "menu-app");
const DEV_VARS_PATH = resolve(OPS_DIR, ".dev.vars");

/** Secrets + config fills written into .dev.vars. */
const DEV_VAR_KEYS = [
  "OPS_LOCAL_ADMIN_PW",
  "OPS_SESSION_SECRET",
  "GOOGLE_OAUTH_CLIENT_ID",
  "GOOGLE_OAUTH_CLIENT_SECRET",
  "GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON",
  "GOOGLE_CALENDAR_ID_LOCAL",
  "BASEROW_API_KEY",
  "BASEROW_OPS_DEV_API_KEY",
  "BASEROW_WEBSITE_API_KEY",
  "BASEROW_CONFIG_API_KEY",
  "BASEROW_OPS_DATABASE_ID",
  "SANITY_API_TOKEN",
  "DEPLOY_WEBHOOK_SECRET",
  "FORMS_ADMIN_SECRET",
  // Optional env overrides (normally config database):
  "SANITY_PROJECT_ID",
  "SANITY_DATASET",
  "SITE_DEPLOY_WEBHOOK_URL",
  "SANITY_STUDIO_SITE_DEPLOY_URL",
  "GOOGLE_CALENDAR_ID",
];

const LIVE = process.argv.includes("--live");

const OPS_DEV_META_PATH = resolve(ROOT, ".baserow-ops-dev.json");

function loadRootEnv() {
  const { secrets } = loadRepoEnv({ app: "ops", override: true });
  if (!secrets) console.warn("No .env.secrets at repo root. Run npm run env:secrets:pull.");
}

function resolveLocalOpsDatabaseId() {
  const fromEnv = process.env.BASEROW_OPS_DATABASE_ID?.trim();
  if (fromEnv) return fromEnv;
  if (existsSync(OPS_DEV_META_PATH)) {
    try {
      const meta = JSON.parse(readFileSync(OPS_DEV_META_PATH, "utf8"));
      return String(meta.databaseId || "").trim();
    } catch {
      return "";
    }
  }
  return "";
}

/**
 * Local ops must use the Gwenda Dev Sanity project, with a token for it
 * (SANITY_API_TOKEN__LOCAL in Secrets Manager).
 */
async function useDevSanityProject() {
  const { DEV_SANITY_PROJECT_ID } = await import("../ops/site/functions/_lib/sanity.js");
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
        "Saves will fail until SANITY_API_TOKEN__LOCAL in Secrets Manager holds its token; then npm run env:secrets:pull.",
    );
  }
}

function assertLocalNotProdDatabase(databaseId) {
  return import("../ops/site/functions/_lib/baserow.js").then(
    ({ OPS_PRODUCTION_DATABASE_ID }) => {
      if (!databaseId) {
        throw new Error(
          "Local ops needs BASEROW_OPS_DATABASE_ID (dev clone). Run: npm run dev:refresh:baserow-ops",
        );
      }
      if (String(databaseId) === String(OPS_PRODUCTION_DATABASE_ID)) {
        throw new Error(
          `Refusing to start local ops against production Baserow DB ${OPS_PRODUCTION_DATABASE_ID}. ` +
            `Set BASEROW_OPS_DATABASE_ID to the Gwenda Dev Ops clone (see .baserow-ops-dev.json).`,
        );
      }
    },
  );
}

/** Production ops secrets (runtime names) straight from Secrets Manager. */
async function loadProductionSecrets() {
  const {
    APP_SECRETS,
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
  // Keep the local sign-in fallback; it is not a production secret.
  void APP_SECRETS;
}

function writeDevVars() {
  const lines = [
    "# Generated by npm run ops:dev from .env + .env.secrets",
    "# Do not commit. Plain ops config is loaded from the Baserow config database.",
  ];
  for (const key of DEV_VAR_KEYS) {
    const value = process.env[key]?.trim();
    if (!value) continue;
    lines.push(`${key}=${value}`);
  }
  lines.push(LIVE ? "SITE_ENV=production" : "SITE_ENV=local");
  if (LIVE) lines.push("OPS_LOCAL_LIVE=1");

  const googleId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim();
  const googleSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim();
  const session = process.env.OPS_SESSION_SECRET?.trim();
  const password =
    process.env.OPS_LOCAL_ADMIN_PW?.trim() ||
    process.env.OPS_PASSWORD?.trim();

  if (googleId && googleSecret && session) {
    // Google mode
  } else if (password) {
    // Password-only fallback
  } else {
    throw new Error(
      "Set GOOGLE_OAUTH_CLIENT_ID/SECRET + OPS_SESSION_SECRET (or OPS_LOCAL_ADMIN_PW) in Secrets Manager (npm run env:secrets:pull).",
    );
  }
  writeFileSync(DEV_VARS_PATH, `${lines.join("\n")}\n`);
  console.log(`Wrote ${DEV_VARS_PATH}`);
}

async function main() {
  loadRootEnv();

  if (LIVE) {
    const localPassword = process.env.OPS_LOCAL_ADMIN_PW;
    await loadProductionSecrets();
    if (localPassword && !process.env.OPS_LOCAL_ADMIN_PW) process.env.OPS_LOCAL_ADMIN_PW = localPassword;
    const { OPS_PRODUCTION_DATABASE_ID } = await import("../ops/site/functions/_lib/baserow.js");
    process.env.BASEROW_OPS_DATABASE_ID = OPS_PRODUCTION_DATABASE_ID;
    // Repo .env points local work at the dev Sanity project; live is the real one.
    const { REAL_SANITY_PROJECT_ID } = await import("../ops/site/functions/_lib/sanity.js");
    process.env.SANITY_PROJECT_ID = REAL_SANITY_PROJECT_ID;
    console.warn(`
  ************************************************************
  *  LIVE MODE: this local ops uses PRODUCTION data.         *
  *  Saves, "Update website" and "Update website now" change *
  *  the real Ops DB and gwenda.co.uk.                        *
  ************************************************************
`);
  } else {
    const databaseId = resolveLocalOpsDatabaseId();
    if (databaseId) process.env.BASEROW_OPS_DATABASE_ID = databaseId;
    await assertLocalNotProdDatabase(process.env.BASEROW_OPS_DATABASE_ID?.trim() || "");
    await useDevSanityProject();
  }

  // Pull plain settings (e.g. Google client id) from config when missing in env.
  if (process.env.BASEROW_CONFIG_API_KEY?.trim()) {
    try {
      const { applyOpsAppConfig } = await import(
        "../ops/site/functions/_lib/config-store.js"
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
  writeDevVars();
  console.log(
    LIVE
      ? `Baserow Ops DB: ${process.env.BASEROW_OPS_DATABASE_ID} (PRODUCTION)`
      : `Local Baserow Ops DB: ${process.env.BASEROW_OPS_DATABASE_ID} (not production)`,
  );

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

  const googleReady = Boolean(
    process.env.GOOGLE_OAUTH_CLIENT_ID?.trim() &&
      process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim() &&
      process.env.OPS_SESSION_SECRET?.trim(),
  );
  // TODO: Local Wrangler (:8788) still serves the built SPA from ops/site/src,
  // so both ports show a UI. Prefer Wrangler proxying unmatched document
  // routes to Vite (:5174) so there is one live SPA with HMR, and :8788 is
  // Functions + static HTML tools only.
  console.log(`
Ops local:
  SPA (HMR):       http://localhost:5174/
  Pages + auth:    http://localhost:8788/
  Auth:            ${
    googleReady
      ? "Google OAuth + Baserow Users (same as production)"
      : "OPS_LOCAL_ADMIN_PW gate"
  }
`);

  run(
    "npx",
    ["wrangler", "pages", "dev", "src", "--ip", "0.0.0.0", "--port", "8788"],
    OPS_DIR,
    "wrangler",
  );
  run("npx", ["vite", "--host", "0.0.0.0"], MENU_APP, "vite");

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
