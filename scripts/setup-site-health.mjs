#!/usr/bin/env node
/**
 * Create KV, deploy gwenda-site-health, and sync SMTP_PASSWORD.
 *
 * Usage:
 *   npm run setup:site-health
 *
 * Needs in repo-root .env / .env.web:
 *   CLOUDFLARE_DEV_API_TOKEN (or CLOUDFLARE_API_TOKEN), SMTP_PASSWORD
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseDotEnv } from "../marketing/web/functions/_lib/env-pem.js";
import { resolveCloudflareDevToken } from "./lib/cloudflare-tokens.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WORKER_DIR = resolve(ROOT, "marketing/site-health");
const WRANGLER_PATH = resolve(WORKER_DIR, "wrangler.toml");
const KV_TITLE = "gwenda-site-health-HEALTH_STATE";

function loadEnvFile(path, { override = false } = {}) {
  if (!existsSync(path)) return;
  for (const [key, value] of parseDotEnv(readFileSync(path, "utf8"))) {
    if (!value) continue;
    if (override || !process.env[key]) process.env[key] = value;
  }
}

function run(
  cmd,
  args,
  { cwd = ROOT, env = process.env, input, quiet = false } = {},
) {
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

function readKvId() {
  const toml = readFileSync(WRANGLER_PATH, "utf8");
  const match = toml.match(
    /binding\s*=\s*"HEALTH_STATE"[\s\S]*?id\s*=\s*"([^"]+)"/,
  );
  return match?.[1] ?? "";
}

function writeKvId(id) {
  const toml = readFileSync(WRANGLER_PATH, "utf8");
  const next = toml.replace(
    /binding\s*=\s*"HEALTH_STATE"\s*\nid\s*=\s*"[^"]+"/,
    `binding = "HEALTH_STATE"\nid = "${id}"`,
  );
  if (next === toml) {
    throw new Error("Could not write HEALTH_STATE id into wrangler.toml");
  }
  writeFileSync(WRANGLER_PATH, next);
}

function isPlaceholderKvId(id) {
  return !id || id === "REPLACE_ME";
}

function parseNamespaceId(output) {
  const match = output.match(/id\s*=\s*"([0-9a-f]{32})"/i);
  return match?.[1] ?? "";
}

function ensureKvNamespace(wranglerEnv) {
  const current = readKvId();
  if (!isPlaceholderKvId(current)) {
    console.log(`KV HEALTH_STATE already set (${current}).`);
    return current;
  }

  const listed = run("npx", ["wrangler", "kv", "namespace", "list"], {
    cwd: WORKER_DIR,
    env: wranglerEnv,
    quiet: true,
  });
  try {
    const namespaces = JSON.parse(listed);
    const existing = Array.isArray(namespaces)
      ? namespaces.find((ns) => ns?.title === KV_TITLE)
      : null;
    if (existing?.id) {
      writeKvId(existing.id);
      console.log(`Reused KV namespace ${KV_TITLE} (${existing.id}).`);
      return existing.id;
    }
  } catch {
    // Fall through to create.
  }

  const created = run(
    "npx",
    ["wrangler", "kv", "namespace", "create", "HEALTH_STATE"],
    {
      cwd: WORKER_DIR,
      env: wranglerEnv,
      quiet: true,
    },
  );
  const id = parseNamespaceId(created);
  if (!id) {
    throw new Error(`Could not parse KV namespace id from:\n${created}`);
  }
  writeKvId(id);
  console.log(`Created KV namespace ${KV_TITLE} (${id}).`);
  return id;
}

function main() {
  loadEnvFile(resolve(ROOT, ".env"));
  loadEnvFile(resolve(ROOT, ".env.ark"), { override: true });
  loadEnvFile(resolve(ROOT, ".env.web"), { override: true });

  const cloudflareToken =
    process.env.CLOUDFLARE_API_TOKEN?.trim() || resolveCloudflareDevToken();
  const smtpPassword = (process.env.SMTP_PASSWORD ?? "").replace(/\s+/g, "");
  if (!cloudflareToken) {
    throw new Error(
      "CLOUDFLARE_API_TOKEN (or CLOUDFLARE_DEV_API_TOKEN) is missing from .env / .env.ark",
    );
  }
  if (!smtpPassword) {
    throw new Error("SMTP_PASSWORD is missing from .env / .env.web");
  }

  const accountId = readWranglerAccountId();
  const wranglerEnv = {
    CLOUDFLARE_API_TOKEN: cloudflareToken,
    CLOUDFLARE_ACCOUNT_ID: accountId,
  };

  ensureKvNamespace(wranglerEnv);

  console.log("Deploying Worker…");
  run("npx", ["wrangler", "deploy"], {
    cwd: WORKER_DIR,
    env: wranglerEnv,
    quiet: true,
  });
  const host = "health.gwenda.co.uk";
  console.log(`Worker URL: https://${host}`);

  console.log("Syncing Worker secret SMTP_PASSWORD…");
  run("npx", ["wrangler", "secret", "put", "SMTP_PASSWORD"], {
    cwd: WORKER_DIR,
    env: wranglerEnv,
    input: smtpPassword,
    quiet: true,
  });
  console.log("Worker secret synced.");

  console.log(
    "\nDone.\n" +
      `- Probe: ${process.env.SITE_URL?.trim() || "https://gwenda.co.uk"}/health\n` +
      `- Worker health: https://${host}/health\n` +
      "- Cron: every 5 minutes. Alerts go to alerts@gwenda.co.uk after two consecutive failures.\n",
  );
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
