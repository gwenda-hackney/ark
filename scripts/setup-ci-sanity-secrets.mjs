#!/usr/bin/env node
/**
 * Create Sanity CI robot tokens (Viewer + Deploy Studio) using the Developer
 * token in repo-root .env, then push them to GitHub Actions secrets.
 *
 * Usage:
 *   npm run setup:ci-secrets
 *
 * Requires:
 *   - .env with SANITY_API_TOKEN (Developer) and SANITY_PROJECT_ID
 *   - gh authenticated with repo + workflow scope (gh auth login)
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const API_VERSION = "v2025-08-18";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ENV_PATH = resolve(ROOT, ".env");

const TOKEN_SPECS = [
  {
    label: "ark-ci-viewer",
    roleName: "viewer",
    ghSecret: "SANITY_API_TOKEN",
  },
  {
    label: "ark-ci-deploy-studio",
    roleName: "deploy-studio",
    ghSecret: "SANITY_DEPLOY_TOKEN",
  },
];

function loadDotEnv() {
  if (!existsSync(ENV_PATH)) {
    throw new Error(`Missing ${ENV_PATH} — add SANITY_API_TOKEN (Developer) first.`);
  }

  for (const line of readFileSync(ENV_PATH, "utf8").split("\n")) {
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

function run(command, args, { input, quiet = false } = {}) {
  const result = spawnSync(command, args, {
    input,
    encoding: "utf8",
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

async function listRobotRoles(projectId, adminToken) {
  const roles = await sanityRequest(`/projects/${projectId}/roles`, { adminToken, projectId });
  return roles.filter((role) => role.appliesToRobots).map((role) => role.name);
}

async function deleteTokenByLabel(projectId, adminToken, label) {
  const tokens = await sanityRequest(`/projects/${projectId}/tokens`, { adminToken, projectId });
  const existing = tokens.filter((token) => token.label === label);
  for (const token of existing) {
    await sanityRequest(`/projects/${projectId}/tokens/${token.id}`, {
      method: "DELETE",
      adminToken,
      projectId,
    });
    console.log(`Revoked previous Sanity token "${label}" (${token.id}).`);
  }
}

async function createToken(projectId, adminToken, { label, roleName }) {
  const created = await sanityRequest(`/projects/${projectId}/tokens`, {
    method: "POST",
    adminToken,
    projectId,
    body: { label, roleName },
  });

  const key = created?.key;
  if (typeof key !== "string" || !key.startsWith("sk")) {
    throw new Error(`Sanity did not return a token key for "${label}".`);
  }

  console.log(`Created Sanity token "${label}" (${roleName}).`);
  return key;
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

function repoSlug() {
  const fromGh = run("gh", ["repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner"], {
    quiet: true,
  }).trim();
  if (fromGh) return fromGh;

  throw new Error("Could not resolve GitHub repo — run from the ark checkout with gh configured.");
}

async function main() {
  loadDotEnv();

  const projectId = process.env.SANITY_PROJECT_ID?.trim() || "pn5yjro6";
  const adminToken = process.env.SANITY_API_TOKEN?.trim();
  if (!adminToken) {
    throw new Error("SANITY_API_TOKEN is missing from .env (Developer token required).");
  }

  assertGhAuth();

  const robotRoles = await listRobotRoles(projectId, adminToken);
  for (const spec of TOKEN_SPECS) {
    if (!robotRoles.includes(spec.roleName)) {
      throw new Error(
        `Role "${spec.roleName}" is not available for robot tokens. Available: ${robotRoles.join(", ")}`,
      );
    }
  }

  console.log(`Project ${projectId} — creating CI tokens and updating GitHub secrets…`);

  for (const spec of TOKEN_SPECS) {
    await deleteTokenByLabel(projectId, adminToken, spec.label);
    const key = await createToken(projectId, adminToken, spec);
    setGhSecret(spec.ghSecret, key);
  }

  console.log("Done. Re-run the failed staging deploy (or push a commit) to pick up the new secrets.");
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
