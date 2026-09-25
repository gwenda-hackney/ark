#!/usr/bin/env node
/**
 * One-shot setup for Studio → site content deploy:
 *   - generate DEPLOY_WEBHOOK_SECRET (or reuse from .env.secrets) and store it in Secrets Manager
 *   - push GitHub secrets (DEPLOY_WEBHOOK_SECRET, DISPATCH_TOKEN, SANITY_STUDIO_SITE_DEPLOY_URL)
 *   - deploy gwenda-site-deploy-webhook Worker + sync Worker secrets
 *   - write SANITY_STUDIO_SITE_DEPLOY_URL into repo-root .env for local Studio
 *
 * Usage:
 *   npm run setup:site-deploy
 *
 * Requires:
 *   - .env.secrets with CLOUDFLARE_API_TOKEN (npm run env:secrets:pull)
 *   - gh authenticated with repo + workflow scope (gh auth login)
 */
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadRepoEnv } from "./lib/load-env.mjs";
import { upsertSmSecret } from "./lib/bitwarden-sm.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ENV_PATH = resolve(ROOT, ".env");
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

function repoSlug() {
  const fromGh = run("gh", ["repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner"], {
    quiet: true,
  }).trim();
  if (fromGh) return fromGh;
  throw new Error("Could not resolve GitHub repo — run from the ark checkout with gh configured.");
}

function assertGhAuth() {
  try {
    run("gh", ["auth", "status"], { quiet: true });
  } catch {
    throw new Error(
      "GitHub CLI is not authenticated. Run:\n" +
        "  gh auth login -h github.com -p https -s repo,workflow",
    );
  }
}

function setGhSecret(name, value) {
  run("gh", ["secret", "set", name, "--repo", repoSlug()], { input: value, quiet: true });
  console.log(`Set GitHub secret ${name}.`);
}

function readWranglerAccountId() {
  const toml = readFileSync(resolve(WORKER_DIR, "wrangler.toml"), "utf8");
  const match = toml.match(/^account_id\s*=\s*"([^"]+)"/m);
  if (!match) throw new Error("account_id not found in marketing/site-deploy-webhook/wrangler.toml");
  return match[1];
}

function writeSiteDeployEnvLines(lines) {
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

  const block = `\n\n# Site deploy (npm run setup:site-deploy)\n${lines.join("\n")}\n`;
  writeFileSync(ENV_PATH, filtered ? `${filtered}${block}` : `${block.trimStart()}\n`);
}

const API_VERSION = "v2025-08-18";
const DEPLOY_STUDIO_LABEL = "ark-ci-deploy-studio";

async function sanityRequest(path, { method = "GET", body, adminToken, projectId }) {
  const res = await fetch(`https://api.sanity.io/${API_VERSION}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${adminToken}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!res.ok) {
    const message =
      typeof data === "object" && data && "message" in data
        ? String(data.message)
        : text || res.statusText;
    throw new Error(`Sanity API ${method} ${path} → ${res.status}: ${message}`);
  }

  return data;
}

async function createDeployStudioToken(projectId, adminToken) {
  const tokens = await sanityRequest(`/projects/${projectId}/tokens`, { adminToken, projectId });
  for (const token of tokens.filter((entry) => entry.label === DEPLOY_STUDIO_LABEL)) {
    await sanityRequest(`/projects/${projectId}/tokens/${token.id}`, {
      method: "DELETE",
      adminToken,
      projectId,
    });
  }

  const created = await sanityRequest(`/projects/${projectId}/tokens`, {
    method: "POST",
    adminToken,
    projectId,
    body: { label: DEPLOY_STUDIO_LABEL, roleName: "deploy-studio" },
  });

  const key = created?.key;
  if (typeof key !== "string" || !key.startsWith("sk")) {
    throw new Error("Sanity did not return a deploy-studio token key.");
  }

  return key;
}

function resolvePersonalSanityToken() {
  const fromEnv = process.env.SANITY_AUTH_TOKEN?.trim();
  if (fromEnv) return fromEnv;
  const studioDir = resolve(ROOT, "studio");
  const out = run("npx", ["sanity", "debug", "--secrets"], {
    cwd: studioDir,
    quiet: true,
  });
  const match = out.match(/Auth token:\s+(\S+)/);
  if (!match) {
    throw new Error(
      "Need a Deploy Studio token or personal Sanity login.\n" +
        "  Set SANITY_DEPLOY_TOKEN in .env, or run: npx sanity login",
    );
  }
  return match[1];
}


function deployHostedDevStudio({ deploySecret, workerUrl, deployStudioToken }) {
  console.log("Deploying hosted development Studio with site deploy config…");
  run("npm", ["run", "studio:deploy:dev"], {
    env: {
      SANITY_ACTIVE_ENV: "development",
      SANITY_DEPLOY_TOKEN: deployStudioToken,
      SANITY_AUTH_TOKEN: deployStudioToken,
      SANITY_STUDIO_SITE_DEPLOY_URL: workerUrl,
      SANITY_STUDIO_SITE_DEPLOY_SECRET: deploySecret,
    },
  });
}

async function main() {
  loadRepoEnv();
  assertGhAuth();

  const cloudflareToken = process.env.CLOUDFLARE_API_TOKEN?.trim();
  if (!cloudflareToken) {
    throw new Error("CLOUDFLARE_API_TOKEN is missing. Run npm run env:secrets:pull.");
  }

  let deploySecret = process.env.DEPLOY_WEBHOOK_SECRET?.trim();
  if (!deploySecret) {
    deploySecret = randomBytes(32).toString("hex");
    console.log("Generated DEPLOY_WEBHOOK_SECRET.");
  } else {
    console.log("Reusing DEPLOY_WEBHOOK_SECRET from .env.secrets.");
  }

  const dispatchToken = run("gh", ["auth", "token"], { quiet: true }).trim();
  if (!dispatchToken) {
    throw new Error("gh auth token is empty — re-run gh auth login.");
  }

  const accountId = readWranglerAccountId();
  const wranglerEnv = {
    CLOUDFLARE_API_TOKEN: cloudflareToken,
    CLOUDFLARE_ACCOUNT_ID: accountId,
  };

  console.log("Pushing GitHub secrets…");
  setGhSecret("DEPLOY_WEBHOOK_SECRET", deploySecret);
  setGhSecret("DISPATCH_TOKEN", dispatchToken);

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

  setGhSecret("SANITY_STUDIO_SITE_DEPLOY_URL", workerUrl);

  if (upsertSmSecret({ key: "DEPLOY_WEBHOOK_SECRET", value: deploySecret }) !== "unchanged") {
    console.log("Stored DEPLOY_WEBHOOK_SECRET in Secrets Manager. Run npm run env:secrets:pull.");
  }
  writeSiteDeployEnvLines([`SANITY_STUDIO_SITE_DEPLOY_URL=${workerUrl}`]);
  console.log(`Updated ${ENV_PATH} with the site deploy URL.`);

  const projectIdRaw = process.env.SANITY_PROJECT_ID?.trim();
  const projectId = projectIdRaw && /^[a-z0-9]+$/.test(projectIdRaw) && projectIdRaw.length <= 12
    ? projectIdRaw
    : "pn5yjro6";

  let deployStudioToken = process.env.SANITY_DEPLOY_TOKEN?.trim();
  if (deployStudioToken) {
    console.log("Reusing SANITY_DEPLOY_TOKEN from .env for hosted Studio deploy.");
  } else {
    console.log(
      "SANITY_DEPLOY_TOKEN missing — minting ark-ci-deploy-studio via personal Sanity login…",
    );
    const personalToken = resolvePersonalSanityToken();
    deployStudioToken = await createDeployStudioToken(projectId, personalToken);
  }
  deployHostedDevStudio({ deploySecret, workerUrl, deployStudioToken });

  console.log(
    "\nDone.\n" +
      "- Local Studio: restart `npm run studio:dev` (with-env loads .env).\n" +
      "- Hosted dev Studio: redeployed with site deploy config.\n" +
      "- Content deploy button: works after site-deploy workflows are on `main` (push pending commits).\n" +
      "- Production Studio: `npm run studio:deploy:prod` when ready.",
  );
}

try {
  await main();
} catch (err) {
  console.error(err.message || err);
  process.exit(1);
}
