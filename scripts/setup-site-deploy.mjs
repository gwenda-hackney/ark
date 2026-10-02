#!/usr/bin/env node
/**
 * One-shot setup for the site deploy webhook (ops → site rebuilds):
 *   - generate DEPLOY_WEBHOOK_SECRET (or reuse the one in Secrets Manager)
 *   - store it in Secrets Manager; CI reads it from there
 *   - give the Worker DISPATCH_TOKEN from Secrets Manager: a fine-grained
 *     GitHub token for gwenda-hackney/ark only (Actions: read and write,
 *     Contents: read). Never a personal `gh auth token`, which reaches
 *     everything its owner can.
 *   - deploy gwenda-site-deploy-webhook Worker + sync Worker secrets
 *
 * Usage:
 *   npm run setup:site-deploy
 *
 * Requires:
 *   - CLOUDFLARE_API_TOKEN from Secrets Manager (bw-unlock)
 */
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadRepoEnv } from "./lib/load-env.mjs";
import { productionSecretValues, upsertSmSecret } from "./lib/bitwarden-sm.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WORKER_DIR = resolve(ROOT, "marketing/site-deploy-webhook");
const WORKER_NAME = "gwenda-site-deploy-webhook";

function run(command, args, { input, env, cwd = ROOT, quiet = false } = {}) {
  const result = spawnSync(command, args, {
    input,
    encoding: "utf8",
    cwd,
    env: { ...process.env, ...env },
    stdio: quiet ? ["pipe", "pipe", "pipe"] : "inherit",
  });

  if (result.status !== 0) {
    const detail = [result.stderr, result.stdout].filter(Boolean).join("\n").trim();
    throw new Error(
      detail ? `${command} ${args.join(" ")} failed:\n${detail}` : `${command} ${args.join(" ")} failed`,
    );
  }

  return result.stdout ?? "";
}

function readWranglerAccountId() {
  const toml = readFileSync(resolve(WORKER_DIR, "wrangler.toml"), "utf8");
  const match = toml.match(/^account_id\s*=\s*"([^"]+)"/m);
  if (!match) throw new Error("account_id not found in marketing/site-deploy-webhook/wrangler.toml");
  return match[1];
}

async function main() {
  loadRepoEnv();

  const cloudflareToken = process.env.CLOUDFLARE_API_TOKEN?.trim();
  if (!cloudflareToken) {
    throw new Error("CLOUDFLARE_API_TOKEN is missing. Run bw-unlock.");
  }

  let deploySecret = process.env.DEPLOY_WEBHOOK_SECRET?.trim();
  if (!deploySecret) {
    deploySecret = randomBytes(32).toString("hex");
    console.log("Generated DEPLOY_WEBHOOK_SECRET.");
  } else {
    console.log("Reusing DEPLOY_WEBHOOK_SECRET from Secrets Manager.");
  }

  const dispatchToken = productionSecretValues().get("DISPATCH_TOKEN")?.trim();
  if (!dispatchToken) {
    throw new Error(
      "DISPATCH_TOKEN__PRODUCTION is missing from Secrets Manager (ark). Create a fine-grained GitHub token " +
        "for gwenda-hackney/ark (Actions: read and write, Contents: read); see docs/secrets-rebuild.md.",
    );
  }

  const accountId = readWranglerAccountId();
  const wranglerEnv = {
    CLOUDFLARE_API_TOKEN: cloudflareToken,
    CLOUDFLARE_ACCOUNT_ID: accountId,
  };

  console.log("Deploying site-deploy webhook Worker…");
  const deployOut = run("npx", ["wrangler", "deploy"], {
    cwd: WORKER_DIR,
    env: wranglerEnv,
    quiet: true,
  });

  const urlMatch = deployOut.match(/https:\/\/[^\s]+\.workers\.dev/);
  const workerUrl =
    process.env.SANITY_STUDIO_SITE_DEPLOY_URL?.trim() ||
    (urlMatch ? urlMatch[0] : `https://${WORKER_NAME}.${accountId}.workers.dev`);

  console.log(`Worker URL: ${workerUrl}`);

  console.log("Syncing Worker secrets…");
  run("npx", ["wrangler", "secret", "put", "DEPLOY_WEBHOOK_SECRET"], {
    cwd: WORKER_DIR,
    env: wranglerEnv,
    input: deploySecret,
    quiet: true,
  });
  run("npx", ["wrangler", "secret", "put", "GITHUB_TOKEN"], {
    cwd: WORKER_DIR,
    env: wranglerEnv,
    input: dispatchToken,
    quiet: true,
  });
  console.log("Worker secrets synced.");

  if (upsertSmSecret({ key: "DEPLOY_WEBHOOK_SECRET", value: deploySecret }) !== "unchanged") {
    console.log("Stored DEPLOY_WEBHOOK_SECRET in Secrets Manager.");
  }
  console.log(
    `If the URL changed, update SANITY_STUDIO_SITE_DEPLOY_URL in ops/site/wrangler*.toml: ${workerUrl}`,
  );

  console.log(
    "\nDone.\n" +
      "- Ops starts preview and live rebuilds through this webhook once the workflows are on `main`.",
  );
}

try {
  await main();
} catch (err) {
  console.error(err.message || err);
  process.exit(1);
}
