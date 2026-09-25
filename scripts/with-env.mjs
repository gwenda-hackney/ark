#!/usr/bin/env node
/**
 * Run a command with the web app env: repo-root `.env` plus `.env.secrets`
 * (`npm run env:secrets:pull`) under web runtime names. Missing files are
 * skipped so CI can inject env vars via workflow secrets instead. Studio, web,
 * and CLI share this loader; root names map to SANITY_STUDIO_* aliases (see
 * deriveStudioEnv).
 */
import { spawnSync } from "node:child_process";
import { loadRepoEnv } from "./lib/load-env.mjs";

function setEnvIfMissing(key, value) {
  // Treat empty string as unset so a blank shell export does not block .env.
  if (value !== undefined && value !== "" && !process.env[key]) {
    process.env[key] = value;
  }
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
  } else if (activeEnv === "staging" || activeEnv === "development") {
    setEnvIfMissing("SANITY_STUDIO_DATASET", "staging");
    setEnvIfMissing("SANITY_STUDIO_HOSTNAME", "gwenda-dev");
  } else {
    copyEnvIfMissing("SANITY_STUDIO_DATASET", "SANITY_DATASET");
    if (!process.env.SANITY_STUDIO_HOSTNAME?.trim()) {
      const dataset =
        process.env.SANITY_STUDIO_DATASET?.trim() ||
        process.env.SANITY_DATASET?.trim() ||
        "staging";
      setEnvIfMissing(
        "SANITY_STUDIO_HOSTNAME",
        dataset === "production" ? "gwenda" : "gwenda-dev",
      );
    }
  }

  copyEnvIfMissing("SANITY_STUDIO_PROJECT_ID", "SANITY_PROJECT_ID");
  copyEnvIfMissing("SANITY_STUDIO_SITE_DEPLOY_SECRET", "DEPLOY_WEBHOOK_SECRET");
  copyEnvIfMissing("SANITY_STUDIO_SITE_DEPLOY_URL", "SITE_DEPLOY_WEBHOOK_URL");
}

loadRepoEnv({ app: "web", override: true });

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
