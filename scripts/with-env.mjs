#!/usr/bin/env node
/**
 * Run a command after loading repo-root `.env` when present.
 * Skips missing file so CI can inject env vars via workflow secrets instead.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = join(root, ".env");

if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;

    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

// Sanity CLI (`sanity deploy`) reads SANITY_AUTH_TOKEN; we standardise on SANITY_API_TOKEN.
if (process.env.SANITY_API_TOKEN && !process.env.SANITY_AUTH_TOKEN) {
  process.env.SANITY_AUTH_TOKEN = process.env.SANITY_API_TOKEN;
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
