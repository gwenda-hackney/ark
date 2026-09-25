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

/**
 * One repo-root .env — map shared names to Sanity Studio build-time vars. The
 * project picks the Studio (sanity.cli.ts); each project has one dataset.
 */
function deriveStudioEnv() {
  copyEnvIfMissing("SANITY_STUDIO_PROJECT_ID", "SANITY_PROJECT_ID");
  copyEnvIfMissing("SANITY_STUDIO_DATASET", "SANITY_DATASET");
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
