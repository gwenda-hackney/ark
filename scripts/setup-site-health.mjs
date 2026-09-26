#!/usr/bin/env node
/**
 * Create KV, put the Gmail service account, and deploy gwenda-site-health.
 *
 * Usage:
 *   npm run setup:site-health
 *
 * Needs from Secrets Manager (bw-unlock):
 *   CLOUDFLARE_API_TOKEN, GOOGLE_SERVICE_ACCOUNT_JSON
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { loadRepoEnv } from "./lib/load-env.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WORKER_DIR = resolve(ROOT, "marketing/site-health");
const WRANGLER_PATH = resolve(WORKER_DIR, "wrangler.toml");
const KV_TITLE = "gwenda-site-health-HEALTH_STATE";

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
  loadRepoEnv({ app: "web", override: true });

  const cloudflareToken = process.env.CLOUDFLARE_API_TOKEN?.trim();
  const serviceAccount = process.env.GMAIL_SERVICE_ACCOUNT_JSON?.trim() || "";
  if (!cloudflareToken) {
    throw new Error(
      "CLOUDFLARE_API_TOKEN is missing. Run bw-unlock.",
    );
  }
  if (!serviceAccount) {
    throw new Error("GMAIL_SERVICE_ACCOUNT_JSON is missing. Run bw-unlock.");
  }

  const accountId = readWranglerAccountId();
  const wranglerEnv = {
    CLOUDFLARE_API_TOKEN: cloudflareToken,
    CLOUDFLARE_ACCOUNT_ID: accountId,
  };

  ensureKvNamespace(wranglerEnv);

  // Before the deploy: the Worker sends alerts through the Gmail API.
  console.log("Putting Worker secret GMAIL_SERVICE_ACCOUNT_JSON…");
  run("npx", ["wrangler", "secret", "put", "GMAIL_SERVICE_ACCOUNT_JSON"], {
    cwd: WORKER_DIR,
    env: wranglerEnv,
    input: serviceAccount,
    quiet: true,
  });

  console.log("Deploying Worker…");
  run("npx", ["wrangler", "deploy"], {
    cwd: WORKER_DIR,
    env: wranglerEnv,
    quiet: true,
  });
  const host = "health.gwenda.co.uk";
  console.log(`Worker URL: https://${host}`);


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
