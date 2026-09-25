#!/usr/bin/env node
/**
 * Run a command with the ops app env: repo-root `.env` plus `.env.secrets`
 * under ops runtime names. Missing files are skipped so CI can inject secrets
 * another way.
 *
 *   node scripts/with-ops-env.mjs node scripts/setup-baserow-ops.mjs
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
