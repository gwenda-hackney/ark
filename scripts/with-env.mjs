#!/usr/bin/env node
/**
 * Run a command after loading repo-root `.env` (and `.env.web` when present).
 * Skips missing files so CI can inject env vars via workflow secrets instead.
 *
 * Load order: `.env` then `.env.web` (web wins). Marketing secrets come from
 * Secrets Manager via `npm run env:web:pull`. Studio, web, and CLI share this
 * loader; root names map to SANITY_STUDIO_* aliases (see deriveStudioEnv).
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseDotEnv } from "../marketing/web/functions/_lib/env-pem.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = join(root, ".env");
const webEnvPath = join(root, ".env.web");

function setEnvIfMissing(key, value) {
  // Treat empty string as unset so a blank shell export does not block .env.
  if (value !== undefined && value !== "" && !process.env[key]) {
    process.env[key] = value;
  }
}

function applyDotEnv(path, { override = false } = {}) {
  if (!existsSync(path)) return false;
  for (const [key, value] of parseDotEnv(readFileSync(path, "utf8"))) {
    if (override) {
      if (value !== undefined && value !== "") process.env[key] = value;
    } else {
      setEnvIfMissing(key, value);
    }
  }
  return true;
}

function copyEnvIfMissing(target, source) {
  const value = process.env[source]?.trim();
  if (value) setEnvIfMissing(target, value);
}

/** One repo-root .env — map shared names to Sanity Studio build-time vars. */
function deriveStudioEnv() {
  const activeEnv = process.env.SANITY_ACTIVE_ENV?.trim();

  if (activeEnv === "production") {
    setEnvIfMissing("SANITY_STUDIO_DATASET", "production");
    setEnvIfMissing("SANITY_STUDIO_HOSTNAME", "gwenda");
  } else if (activeEnv === "development") {
    setEnvIfMissing("SANITY_STUDIO_DATASET", "development");
    setEnvIfMissing("SANITY_STUDIO_HOSTNAME", "gwenda-dev");
  } else {
    copyEnvIfMissing("SANITY_STUDIO_DATASET", "SANITY_DATASET");
    if (!process.env.SANITY_STUDIO_HOSTNAME?.trim()) {
      const dataset =
        process.env.SANITY_STUDIO_DATASET?.trim() ||
        process.env.SANITY_DATASET?.trim() ||
        "development";
      setEnvIfMissing(
        "SANITY_STUDIO_HOSTNAME",
        dataset === "production" ? "gwenda" : "gwenda-dev",
      );
    }
  }

  copyEnvIfMissing("SANITY_STUDIO_PROJECT_ID", "SANITY_PROJECT_ID");
  copyEnvIfMissing("SANITY_STUDIO_EVENT_ADMIN_SECRET", "EVENT_ADMIN_SECRET");
  copyEnvIfMissing("SANITY_STUDIO_EVENT_ADMIN_URL", "EVENT_ADMIN_URL");
  copyEnvIfMissing("SANITY_STUDIO_BASEROW_RSVP_URL", "BASEROW_RSVP_GRID_URL");
  copyEnvIfMissing("SANITY_STUDIO_SITE_DEPLOY_SECRET", "DEPLOY_WEBHOOK_SECRET");
  copyEnvIfMissing("SANITY_STUDIO_SITE_DEPLOY_URL", "SITE_DEPLOY_WEBHOOK_URL");
}

applyDotEnv(envPath, { override: false });
if (applyDotEnv(webEnvPath, { override: true })) {
  // Quiet: web secrets override shared .env (same pattern as ops .env.ops).
}

deriveStudioEnv();

// Sanity CLI (`sanity deploy`) reads SANITY_AUTH_TOKEN.
// CI passes SANITY_DEPLOY_TOKEN (Deploy Studio role); local dev falls back to SANITY_API_TOKEN.
if (!process.env.SANITY_AUTH_TOKEN) {
  if (process.env.SANITY_DEPLOY_TOKEN) {
    process.env.SANITY_AUTH_TOKEN = process.env.SANITY_DEPLOY_TOKEN;
  } else if (process.env.SANITY_API_TOKEN) {
    process.env.SANITY_AUTH_TOKEN = process.env.SANITY_API_TOKEN;
  }
}

const [command, ...args] = process.argv.slice(2);
if (!command) {
  console.error("usage: with-env <command> [args...]");
  process.exit(1);
}

const result = spawnSync(command, args, {
  stdio: "inherit",
  env: process.env,
});

process.exit(result.status ?? 1);
