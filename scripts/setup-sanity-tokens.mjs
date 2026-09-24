#!/usr/bin/env node
/**
 * Clean Sanity robot tokens to a fixed keep-set, sync GitHub + Bitwarden.
 *
 * Keep-set:
 *   ark-local-editor      Editor        → Secrets Manager SANITY_API_TOKEN (.env.web / .env.ops)
 *   ark-ci-viewer         Viewer        → GitHub SANITY_API_TOKEN (+ BW staging/prod)
 *   ark-ci-deploy-studio  Deploy Studio → GitHub SANITY_DEPLOY_TOKEN (+ BW staging/prod)
 *   ark-ci-dataset-sync   Editor        → GitHub SANITY_DATASET_SYNC_TOKEN (dataset mirror)
 *
 * Admin auth (mint/revoke): personal Sanity CLI session (`npx sanity login`),
 * or SANITY_AUTH_TOKEN env. Do not store the personal token in Bitwarden.
 *
 * Usage:
 *   npm run setup:sanity-tokens
 *   npm run setup:sanity-tokens -- --dry-run
 *   npm run setup:sanity-tokens -- --skip-github --skip-bitwarden
 */
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ENV_ITEMS,
  applySecretsToTemplate,
  createSecureNote,
  ensureBwInstalled,
  ensureFolder,
  ensureItemInFolder,
  ensureServer,
  ensureSession,
  getItemOrNull,
  syncVault,
  updateItemNotes,
  upsertDotEnvKey,
} from "./lib/bitwarden-env.mjs";
import { upsertSmSecret } from "./lib/bitwarden-sm.mjs";
import { loadRepoEnv } from "./lib/load-env.mjs";

const API_VERSION = "v2025-08-18";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ENV_PATH = resolve(ROOT, ".env");
const LOCAL_TEMPLATE = resolve(ROOT, "scripts/env-templates/local.env");
const PROJECT_ID_DEFAULT = "pn5yjro6";

const KEEP = {
  localEditor: {
    label: "ark-local-editor",
    roleName: "editor",
    envKey: "SANITY_API_TOKEN",
  },
  ciViewer: {
    label: "ark-ci-viewer",
    roleName: "viewer",
    ghSecret: "SANITY_API_TOKEN",
    envKey: "SANITY_API_TOKEN",
  },
  ciDeploy: {
    label: "ark-ci-deploy-studio",
    roleName: "deploy-studio",
    ghSecret: "SANITY_DEPLOY_TOKEN",
    envKey: "SANITY_DEPLOY_TOKEN",
  },
  ciDatasetSync: {
    label: "ark-ci-dataset-sync",
    roleName: "editor",
    ghSecret: "SANITY_DATASET_SYNC_TOKEN",
    envKey: "SANITY_DATASET_SYNC_TOKEN",
  },
};

const KEEP_LABELS = new Set(Object.values(KEEP).map((spec) => spec.label));

function parseArgs(argv) {
  const out = { dryRun: false, skipGithub: false, skipBitwarden: false, help: false };
  for (const arg of argv) {
    if (arg === "--dry-run") out.dryRun = true;
    else if (arg === "--skip-github") out.skipGithub = true;
    else if (arg === "--skip-bitwarden") out.skipBitwarden = true;
    else if (arg === "--help" || arg === "-h") out.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return out;
}

function run(command, args, { input, quiet = false, cwd = ROOT } = {}) {
  const result = spawnSync(command, args, {
    input,
    encoding: "utf8",
    cwd,
    env: process.env,
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

function resolveAdminToken() {
  const fromEnv = process.env.SANITY_AUTH_TOKEN?.trim();
  if (fromEnv) return fromEnv;

  const studioDir = resolve(ROOT, "marketing/studio");
  const cwd = existsSync(resolve(studioDir, "sanity.cli.ts")) ? studioDir : ROOT;
  const debug = run("npx", ["sanity", "debug", "--secrets"], { quiet: true, cwd });
  const match = debug.match(/Auth token:\s+(\S+)/);
  if (!match) {
    throw new Error(
      "No Sanity personal session found.\n" +
        "  npx sanity login\n" +
        "  (must be project Administrator)\n" +
        "Or set SANITY_AUTH_TOKEN temporarily for this run.",
    );
  }
  return match[1];
}

async function sanityRequest(path, { method = "GET", body, adminToken } = {}) {
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

function summarizeTokens(tokens) {
  return tokens.map((token) => {
    const roles = Array.isArray(token.roles)
      ? token.roles.map((role) => role.name || role).join(",")
      : token.roleName || token.role || "?";
    return `${token.label || "(no label)"} [${roles}] (${token.id})`;
  });
}

async function listTokens(projectId, adminToken) {
  const data = await sanityRequest(`/projects/${projectId}/tokens`, { adminToken });
  return Array.isArray(data) ? data : data?.tokens || [];
}

async function listRobotRoles(projectId, adminToken) {
  const roles = await sanityRequest(`/projects/${projectId}/roles`, { adminToken });
  const list = Array.isArray(roles) ? roles : roles?.roles || [];
  return list.filter((role) => role.appliesToRobots).map((role) => role.name);
}

async function deleteToken(projectId, adminToken, token, { dryRun }) {
  if (dryRun) {
    console.log(`Would revoke ${token.label || "(no label)"} (${token.id}).`);
    return;
  }
  await sanityRequest(`/projects/${projectId}/tokens/${token.id}`, {
    method: "DELETE",
    adminToken,
  });
  console.log(`Revoked ${token.label || "(no label)"} (${token.id}).`);
}

async function createToken(projectId, adminToken, { label, roleName }, { dryRun }) {
  if (dryRun) {
    console.log(`Would create ${label} (${roleName}).`);
    return `dry-run-${label}`;
  }
  const created = await sanityRequest(`/projects/${projectId}/tokens`, {
    method: "POST",
    adminToken,
    body: { label, roleName },
  });
  const key = created?.key;
  if (typeof key !== "string" || !key.startsWith("sk")) {
    throw new Error(`Sanity did not return a token key for "${label}".`);
  }
  console.log(`Created ${label} (${roleName}).`);
  return key;
}

function tryGhAuth() {
  try {
    run("gh", ["auth", "status"], { quiet: true });
    return true;
  } catch {
    return false;
  }
}

function repoSlug() {
  return run("gh", ["repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner"], {
    quiet: true,
  }).trim();
}

function setGhSecret(name, value) {
  run("gh", ["secret", "set", name, "--repo", repoSlug()], { input: value, quiet: true });
  console.log(`Set GitHub secret ${name}.`);
}

function writeLocalEnv(secrets) {
  const base = existsSync(ENV_PATH)
    ? readFileSync(ENV_PATH, "utf8")
    : existsSync(LOCAL_TEMPLATE)
      ? readFileSync(LOCAL_TEMPLATE, "utf8")
      : "";
  const { content } = applySecretsToTemplate(base || "", secrets);
  if (existsSync(ENV_PATH) && readFileSync(ENV_PATH, "utf8") !== content) {
    copyFileSync(ENV_PATH, `${ENV_PATH}.bak`);
  }
  writeFileSync(ENV_PATH, content);
}

function upsertBitwardenNote(itemName, templatePath, updates, { dryRun }) {
  let item = getItemOrNull(itemName);
  let notes =
    item?.notes ||
    (existsSync(templatePath) ? readFileSync(templatePath, "utf8") : "");

  for (const [key, value] of Object.entries(updates)) {
    if (value == null || value === "") continue;
    notes = upsertDotEnvKey(notes, key, value);
  }

  if (dryRun) {
    console.log(`Would update Bitwarden ${itemName} (${Object.keys(updates).join(", ")}).`);
    return;
  }

  if (!item) {
    const folderId = ensureFolder();
    item = createSecureNote(itemName, notes, { folderId });
    console.log(`Created Bitwarden ${itemName} in folder ark.`);
  } else {
    const folderId = ensureFolder();
    item = ensureItemInFolder(item, folderId);
    updateItemNotes(item, notes);
    console.log(`Updated Bitwarden ${itemName}.`);
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log(`Clean Sanity robot tokens to the ark keep-set.

Usage:
  node scripts/setup-sanity-tokens.mjs [--dry-run] [--skip-github] [--skip-bitwarden]

Requires: npx sanity login (project Administrator).`);
    return;
  }

  loadRepoEnv();
  const projectId = process.env.SANITY_PROJECT_ID?.trim() || PROJECT_ID_DEFAULT;
  const adminToken = resolveAdminToken();

  const before = await listTokens(projectId, adminToken);
  console.log(`Project ${projectId} — current tokens (${before.length}):`);
  for (const line of summarizeTokens(before)) console.log(`  - ${line}`);

  const robotRoles = await listRobotRoles(projectId, adminToken);
  for (const spec of Object.values(KEEP)) {
    if (!robotRoles.includes(spec.roleName)) {
      throw new Error(
        `Role "${spec.roleName}" not available for robots. Available: ${robotRoles.join(", ")}`,
      );
    }
  }

  console.log("\nRecreating keep-set…");
  const keys = {};
  for (const spec of Object.values(KEEP)) {
    const existing = before.filter((token) => token.label === spec.label);
    for (const token of existing) {
      await deleteToken(projectId, adminToken, token, opts);
    }
    keys[spec.label] = await createToken(projectId, adminToken, spec, opts);
  }

  const afterCreate = opts.dryRun ? before : await listTokens(projectId, adminToken);
  const extras = afterCreate.filter((token) => !KEEP_LABELS.has(token.label));
  if (extras.length) {
    console.log(`\nRevoking ${extras.length} extra token(s)…`);
    for (const token of extras) {
      await deleteToken(projectId, adminToken, token, opts);
    }
  } else {
    console.log("\nNo extra tokens to revoke.");
  }

  if (!opts.skipGithub) {
    if (!tryGhAuth()) {
      console.warn(
        "\nGitHub CLI not authenticated — skipped secret sync.\n" +
          "  gh auth login -h github.com -p https -s repo,workflow\n" +
          "  npm run setup:sanity-tokens -- --skip-bitwarden",
      );
    } else if (opts.dryRun) {
      console.log(
        "Would set GitHub secrets SANITY_API_TOKEN, SANITY_DEPLOY_TOKEN, SANITY_DATASET_SYNC_TOKEN.",
      );
    } else {
      setGhSecret(KEEP.ciViewer.ghSecret, keys[KEEP.ciViewer.label]);
      setGhSecret(KEEP.ciDeploy.ghSecret, keys[KEEP.ciDeploy.label]);
      setGhSecret(KEEP.ciDatasetSync.ghSecret, keys[KEEP.ciDatasetSync.label]);
    }
  }

  if (!opts.skipBitwarden) {
    try {
      ensureBwInstalled();
      ensureServer();
      ensureSession();
      syncVault();

      const localUpdates = {
        SANITY_PROJECT_ID: projectId,
        SANITY_DATASET: "staging",
      };
      const sharedCi = {
        SANITY_PROJECT_ID: projectId,
        SANITY_API_TOKEN: keys[KEEP.ciViewer.label],
        SANITY_DEPLOY_TOKEN: keys[KEEP.ciDeploy.label],
        SANITY_DATASET_SYNC_TOKEN: keys[KEEP.ciDatasetSync.label],
      };

      upsertBitwardenNote(
        ENV_ITEMS.local,
        resolve(ROOT, "scripts/env-templates/local.env"),
        localUpdates,
        opts,
      );
      upsertBitwardenNote(
        ENV_ITEMS.staging,
        resolve(ROOT, "scripts/env-templates/staging.env"),
        { ...sharedCi, SANITY_DATASET: "staging" },
        opts,
      );
      upsertBitwardenNote(
        ENV_ITEMS.production,
        resolve(ROOT, "scripts/env-templates/production.env"),
        { ...sharedCi, SANITY_DATASET: "production" },
        opts,
      );
    } catch (err) {
      console.warn(
        `\nBitwarden skipped: ${err instanceof Error ? err.message : err}\n` +
          "  bw login && bw-unlock\n" +
          "  then re-run with --skip-github to push vault notes only",
      );
    }
  }

  if (!opts.dryRun && keys[KEEP.localEditor.label]?.startsWith("sk")) {
    const secrets = new Map([
      ["SANITY_PROJECT_ID", projectId],
      ["SANITY_DATASET", "staging"],
    ]);
    writeLocalEnv(secrets);
    upsertSmSecret({ key: "SANITY_API_TOKEN", value: keys[KEEP.localEditor.label] });
    console.log(
      "Stored ark-local-editor as SANITY_API_TOKEN in Secrets Manager. Run npm run env:web:pull and env:ops:pull.",
    );
  }

  if (!opts.dryRun) {
    const finalTokens = await listTokens(projectId, adminToken);
    console.log(`\nFinal tokens (${finalTokens.length}):`);
    for (const line of summarizeTokens(finalTokens)) console.log(`  - ${line}`);
  }

  console.log(
    opts.dryRun
      ? "\nDry run complete — no changes written."
      : "\nDone. Local SANITY_API_TOKEN is the Editor robot (not your personal CLI session).",
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
