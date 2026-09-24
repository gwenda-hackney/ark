#!/usr/bin/env node
/**
 * Deploy Wi‑Fi captive portal Worker and sync secrets.
 *
 * Needs in repo-root .env:
 *   CLOUDFLARE_API_TOKEN (.env.ark), UNIFI_SITE_MANAGER_API_KEY (.env).
 *   The production Website Baserow token comes from Secrets Manager.
 * Optional: UNIFI_CONSOLE_ID (defaults to wrangler.toml / known UDR console)
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { loadRepoEnv } from "./lib/load-env.mjs";
import { loadAppSecretsFromSm } from "./lib/bitwarden-sm.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WORKER_DIR = resolve(ROOT, "marketing/wifi-captive-portal");
const ENV_PATH = resolve(ROOT, ".env");
const WRANGLER_PATH = resolve(WORKER_DIR, "wrangler.toml");

function run(cmd, args, { cwd = ROOT, env = process.env, input, quiet = false } = {}) {
  const result = spawnSync(cmd, args, {
    cwd,
    env: { ...process.env, ...env },
    input,
    encoding: "utf8",
    shell: false,
  });
  if (result.status !== 0) {
    const detail = [result.stderr, result.stdout].filter(Boolean).join("\n");
    throw new Error(
      `${cmd} ${args.join(" ")} failed (${result.status}): ${detail || "no output"}`,
    );
  }
  if (!quiet && result.stdout) process.stdout.write(result.stdout);
  return result.stdout ?? "";
}

function readWranglerAccountId() {
  const toml = readFileSync(WRANGLER_PATH, "utf8");
  const match = toml.match(/^account_id\s*=\s*"([^"]+)"/m);
  if (!match) throw new Error("account_id not found in wrangler.toml");
  return match[1];
}

function readWranglerConsoleId() {
  const toml = readFileSync(WRANGLER_PATH, "utf8");
  const match = toml.match(/^UNIFI_CONSOLE_ID\s*=\s*"([^"]+)"/m);
  return match?.[1] ?? "";
}

function upsertEnvLines(lines) {
  const existing = existsSync(ENV_PATH) ? readFileSync(ENV_PATH, "utf8") : "";
  const keys = lines.map((line) => line.split("=")[0]);
  const filtered = existing
    .split("\n")
    .filter((line) => {
      const key = line.split("=")[0]?.trim();
      return !keys.includes(key);
    })
    .join("\n")
    .replace(/\n+$/, "");

  const block = `\n\n# Wi‑Fi captive portal (npm run setup:wifi-portal)\n${lines.join("\n")}\n`;
  writeFileSync(
    ENV_PATH,
    filtered ? `${filtered}${block}` : `${block.trimStart()}\n`,
  );
}

function repoSlug() {
  return run(
    "gh",
    ["repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner"],
    { quiet: true },
  ).trim();
}

function setGhSecret(name, value) {
  run("gh", ["secret", "set", name, "--repo", repoSlug()], {
    input: value,
    quiet: true,
  });
  console.log(`Set GitHub secret ${name}.`);
}


/** Production Website token (live Subscribers), from Secrets Manager. */
function productionWebsiteBaserowKey() {
  const { values } = loadAppSecretsFromSm("web", "production");
  return values.get("BASEROW_API_KEY")?.trim() || "";
}

async function main() {
  loadRepoEnv();

  const cloudflareToken = process.env.CLOUDFLARE_API_TOKEN?.trim();
  const baserowKey = productionWebsiteBaserowKey();
  const siteManagerKey = process.env.UNIFI_SITE_MANAGER_API_KEY?.trim();
  const consoleId =
    process.env.UNIFI_CONSOLE_ID?.trim() || readWranglerConsoleId();

  if (!cloudflareToken) throw new Error("CLOUDFLARE_API_TOKEN is missing from .env");
  if (!baserowKey) throw new Error("BASEROW_WEBSITE_API_KEY__PRODUCTION is missing from Secrets Manager.");
  if (!siteManagerKey) {
    throw new Error(
      "UNIFI_SITE_MANAGER_API_KEY is missing from .env\n" +
        "Create one at https://unifi.ui.com → Settings → API Keys",
    );
  }
  if (!consoleId) throw new Error("UNIFI_CONSOLE_ID is missing");

  const accountId = readWranglerAccountId();
  const wranglerEnv = {
    CLOUDFLARE_API_TOKEN: cloudflareToken,
    CLOUDFLARE_ACCOUNT_ID: accountId,
  };

  console.log("Deploying Worker…");
  const deployOut = run("npx", ["wrangler", "deploy"], {
    cwd: WORKER_DIR,
    env: wranglerEnv,
    quiet: true,
  });
  const urlMatch = deployOut.match(/https:\/\/[^\s]+\.workers\.dev/);
  const workerUrl = urlMatch ? urlMatch[0] : "(see wrangler output)";
  console.log(`Worker URL: ${workerUrl}`);

  console.log("Syncing Worker secrets…");
  run("npx", ["wrangler", "secret", "put", "BASEROW_API_KEY"], {
    cwd: WORKER_DIR,
    env: wranglerEnv,
    input: baserowKey,
    quiet: true,
  });
  run("npx", ["wrangler", "secret", "put", "UNIFI_SITE_MANAGER_API_KEY"], {
    cwd: WORKER_DIR,
    env: wranglerEnv,
    input: siteManagerKey,
    quiet: true,
  });
  console.log("Worker secrets synced.");

  try {
    setGhSecret("UNIFI_SITE_MANAGER_API_KEY", siteManagerKey);
    setGhSecret("UNIFI_CONSOLE_ID", consoleId);
  } catch (error) {
    console.warn(
      "Could not set GitHub secrets (gh auth?). CI deploy will need them later:",
      error instanceof Error ? error.message : error,
    );
  }

  const host = "wifi.gwenda.co.uk";
  upsertEnvLines([
    `UNIFI_CONSOLE_ID=${consoleId}`,
    `UNIFI_SITE_MANAGER_API_KEY=${siteManagerKey}`,
    `WIFI_CAPTIVE_PORTAL_URL=https://${host}`,
  ]);
  console.log(`Updated ${ENV_PATH}.`);

  console.log(
    "\nDone.\n" +
      `- Portal: https://${host}/guest/s/default/\n` +
      `- Health: https://${host}/health\n` +
      `- Workers.dev (fallback): ${workerUrl}\n` +
      "\nUniFi (Hotspot → External portal server):\n" +
      `  1. IPv4: Cloudflare anycast for ${host} (dig +short ${host} A)\n` +
      `  2. Domain (on): ${host}\n` +
      `  3. Pre-authorization allowances: ${host} + those A records\n` +
      "  4. Secure portal / HTTPS: on\n",
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
