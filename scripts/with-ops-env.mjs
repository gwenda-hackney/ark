#!/usr/bin/env node
/**
 * Run a command after loading repo-root `.env` then `.env.ops` (ops wins).
 * Missing files are skipped so CI can inject secrets another way.
 *
 *   node scripts/with-ops-env.mjs node scripts/setup-baserow-ops.mjs
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseDotEnv } from "../marketing/web/functions/_lib/env-pem.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function loadEnvFile(path, { override = false } = {}) {
  if (!existsSync(path)) return;
  for (const [key, value] of parseDotEnv(readFileSync(path, "utf8"))) {
    if (override || !process.env[key]) process.env[key] = value;
  }
}

loadEnvFile(join(root, ".env"), { override: false });
loadEnvFile(join(root, ".env.ops"), { override: true });

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
