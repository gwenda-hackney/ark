#!/usr/bin/env node
/**
 * Create (or rotate) the Sanity robot tokens. Each is labelled with the
 * Secrets Manager key that holds it, and stored only in Secrets Manager:
 *
 *   SANITY_API_TOKEN__DEV         Gwenda Dev  Editor
 *   SANITY_API_TOKEN__PRODUCTION  Gwenda      Editor
 *   SANITY_DEPLOY_TOKEN           Gwenda      Deploy Studio
 *
 * It never revokes a token unless asked. With --revoke-old it revokes only the
 * older tokens with the same label, after the new one is stored. Revoke the
 * production ones only once the deploys using the new value are green.
 *
 * Admin auth: your personal Sanity CLI session (`npx sanity login`, project
 * Administrator), or SANITY_AUTH_TOKEN for this run. Needs bw-unlock.
 *
 * Usage:
 *   npm run setup:sanity-tokens -- --dry-run
 *   npm run setup:sanity-tokens -- SANITY_API_TOKEN__DEV
 *   npm run setup:sanity-tokens -- --revoke-old SANITY_DEPLOY_TOKEN
 */
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { upsertSmSecret } from "./lib/bitwarden-sm.mjs";
import { loadRepoEnv } from "./lib/load-env.mjs";
import {
  DEV_SANITY_PROJECT_ID,
  REAL_SANITY_PROJECT_ID,
} from "../ops/site/src/platform/sanity.js";

const API_VERSION = "v2025-08-18";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const SANITY_TOKENS = [
  { key: "SANITY_API_TOKEN__DEV", projectId: DEV_SANITY_PROJECT_ID, roleName: "editor" },
  { key: "SANITY_API_TOKEN__PRODUCTION", projectId: REAL_SANITY_PROJECT_ID, roleName: "editor" },
  { key: "SANITY_DEPLOY_TOKEN", projectId: REAL_SANITY_PROJECT_ID, roleName: "deploy-studio" },
];

function parseArgs(argv) {
  const out = { dryRun: false, revokeOld: false, keys: [], help: false };
  for (const arg of argv) {
    if (arg === "--dry-run") out.dryRun = true;
    else if (arg === "--revoke-old") out.revokeOld = true;
    else if (arg === "--help" || arg === "-h") out.help = true;
    else if (arg.startsWith("-")) throw new Error(`Unknown argument: ${arg}`);
    else out.keys.push(arg);
  }
  const known = new Set(SANITY_TOKENS.map((spec) => spec.key));
  const unknown = out.keys.filter((key) => !known.has(key));
  if (unknown.length) throw new Error(`Unknown token: ${unknown.join(", ")}. Known: ${[...known].join(", ")}`);
  return out;
}

function resolveAdminToken() {
  const fromEnv = process.env.SANITY_AUTH_TOKEN?.trim();
  if (fromEnv) return fromEnv;
  const result = spawnSync("npx", ["sanity", "debug", "--secrets"], { cwd: ROOT, encoding: "utf8" });
  const match = String(result.stdout || "").match(/Auth token:\s+(\S+)/);
  if (!match) {
    throw new Error("No Sanity login. Run `npx sanity login` (project Administrator), or set SANITY_AUTH_TOKEN.");
  }
  return match[1];
}

async function sanity(path, adminToken, { method = "GET", body } = {}) {
  const res = await fetch(`https://api.sanity.io/${API_VERSION}${path}`, {
    method,
    headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(`Sanity ${method} ${path} → ${res.status}: ${data?.message || text}`);
  return data;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log("Usage: node scripts/setup-sanity-tokens.mjs [--dry-run] [--revoke-old] [KEY ...]");
    return;
  }
  loadRepoEnv();
  const adminToken = resolveAdminToken();
  const specs = SANITY_TOKENS.filter((spec) => !opts.keys.length || opts.keys.includes(spec.key));

  for (const spec of specs) {
    const existing = (await sanity(`/projects/${spec.projectId}/tokens`, adminToken)).filter(
      (token) => token.label === spec.key,
    );
    if (opts.dryRun) {
      console.log(
        `${spec.key}: would create a new token (${spec.roleName}) on ${spec.projectId} and store it in SM` +
          (existing.length ? `; ${existing.length} older one(s) ${opts.revokeOld ? "revoked" : "kept"}` : ""),
      );
      continue;
    }
    const created = await sanity(`/projects/${spec.projectId}/tokens`, adminToken, {
      method: "POST",
      body: { label: spec.key, roleName: spec.roleName },
    });
    if (typeof created?.key !== "string") throw new Error(`Sanity returned no key for ${spec.key}.`);
    upsertSmSecret({ key: spec.key, value: created.key });
    console.log(`${spec.key}: created on ${spec.projectId} and stored in Secrets Manager.`);
    for (const token of existing) {
      if (opts.revokeOld) {
        await sanity(`/projects/${spec.projectId}/tokens/${token.id}`, adminToken, { method: "DELETE" });
        console.log(`  revoked the older ${spec.key} (${token.id})`);
      } else {
        console.log(`  the older ${spec.key} (${token.id}) still works; revoke it once deploys are green`);
      }
    }
  }
}

try {
  await main();
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
}
