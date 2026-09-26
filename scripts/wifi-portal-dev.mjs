#!/usr/bin/env node
/**
 * Local Wi‑Fi captive portal: load the local Website Baserow token and UniFi key
 * from the unlocked vault and run `wrangler dev` with them in a per-run env file
 * in the RAM secrets directory (`--env-file`), deleted on exit, never `.dev.vars`.
 *
 *   npm run wifi-portal
 */
import { spawn } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadRepoEnv } from "./lib/load-env.mjs";
import { writeRuntimeEnvFile } from "./lib/secrets-cache.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WORKER_DIR = resolve(ROOT, "marketing/wifi-captive-portal");
const DEV_VARS_PATH = resolve(WORKER_DIR, ".dev.vars");

const SECRET_KEYS = ["BASEROW_API_KEY", "UNIFI_SITE_MANAGER_API_KEY"];

function writeBindings() {
  const bindings = new Map();
  const missing = [];
  for (const key of SECRET_KEYS) {
    const value = process.env[key]?.trim();
    if (value) bindings.set(key, value);
    else missing.push(key);
  }
  if (missing.length) {
    throw new Error(
      `Missing: ${missing.join(", ")} (run bw-unlock; they come from Secrets Manager)\n` +
        "Need BASEROW_API_KEY and UNIFI_SITE_MANAGER_API_KEY for local portal.",
    );
  }
  // An old generated .dev.vars would win over --env-file.
  if (existsSync(DEV_VARS_PATH)) rmSync(DEV_VARS_PATH);
  return writeRuntimeEnvFile("wifi-portal.env", bindings);
}

loadRepoEnv({ app: "web" });
const bindingsFile = writeBindings();

// UniFi redirects to /guest/s/{site}/?id=<guest-mac>&ap=<ap-mac>&…
// Locally you must include id= or /authorize rejects with "Missing device details".
const testUrl =
  "http://127.0.0.1:8787/guest/s/default/?id=aa:bb:cc:dd:ee:ff&ap=11:22:33:44:55:66";
console.log(`\nOpen to test (fake guest MAC):\n  ${testUrl}\n`);
console.log(
  "Baserow write will run for real. UniFi authorize will fail with a fake MAC unless that client is on the hotspot.\n",
);

const extra = process.argv.slice(2);
const child = spawn(
  "npx",
  ["wrangler", "dev", "--local", "--env-file", bindingsFile, ...extra],
  {
    cwd: WORKER_DIR,
    stdio: "inherit",
    env: {
      ...process.env,
      CLOUDFLARE_API_TOKEN:
        process.env.CLOUDFLARE_API_TOKEN?.trim() || undefined,
    },
  },
);

// Ctrl+C reaches Wrangler too; wait for it, then remove the secrets file.
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(signal, () => {});
child.on("exit", (code, signal) => {
  rmSync(bindingsFile, { force: true });
  process.exit(code ?? (signal ? 1 : 0));
});
