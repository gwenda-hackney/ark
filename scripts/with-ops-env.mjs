#!/usr/bin/env node
/**
 * Run a command with the ops app env: repo-root `.env` plus secrets from the
 * unlocked vault (scripts/lib/load-env.mjs) under ops runtime names. In CI the
 * vault is skipped and the job injects secrets another way.
 *
 *   node scripts/with-ops-env.mjs node ops/site/scripts/setup-baserow.mjs
 */
import { spawnSync } from "node:child_process";
import { loadRepoEnv } from "./lib/load-env.mjs";

loadRepoEnv({ app: "ops", override: true });

const args = process.argv.slice(2);
if (!args.length) {
  console.error("Usage: node scripts/with-ops-env.mjs <command> [args…]");
  process.exit(1);
}

const result = spawnSync(args[0], args.slice(1), {
  stdio: "inherit",
  env: process.env,
  shell: process.platform === "win32",
});
process.exit(result.status ?? 1);
