#!/usr/bin/env node
/**
 * Push non-empty keys from repo-root `.env` into Bitwarden `ark/.env.local`.
 * Does not overwrite empty local values into the vault.
 * Skips Bitwarden login credentials stored locally.
 *
 * Usage:
 *   npm run env:push
 *   npm run env:push -- --dry-run
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_LOCAL_ITEM,
  ensureBwInstalled,
  ensureServer,
  ensureSession,
  getItemOrNull,
  secretsFromItem,
  syncVault,
  updateItemNotes,
  upsertDotEnvKey,
} from "./lib/bitwarden-env.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ENV_PATH = resolve(ROOT, ".env");
const SKIP = new Set(["BITWARDEN_EMAIL", "BITWARDEN_PASSWORD", "BW_SESSION", "BW_PASSWORD"]);

function parseArgs(argv) {
  const out = { dryRun: false };
  for (const arg of argv) {
    if (arg === "--dry-run") out.dryRun = true;
    else if (arg === "--help" || arg === "-h") out.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return out;
}

function parseEnv(text) {
  const map = new Map();
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const eq = trimmed.indexOf("=");
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1);
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (value !== "") map.set(key, value);
  }
  return map;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log(`Push filled keys from ${ENV_PATH} into Bitwarden ${DEFAULT_LOCAL_ITEM}

Usage:
  node scripts/push-env-to-bitwarden.mjs [--dry-run]`);
    return;
  }

  ensureBwInstalled();
  ensureServer();
  ensureSession();
  syncVault();

  const item = getItemOrNull(DEFAULT_LOCAL_ITEM);
  if (!item) {
    throw new Error(`Missing Bitwarden item "${DEFAULT_LOCAL_ITEM}". Run: npm run env:seed`);
  }

  const local = parseEnv(readFileSync(ENV_PATH, "utf8"));
  let notes = item.notes || "";
  const updated = [];
  for (const [key, value] of local) {
    if (SKIP.has(key)) continue;
    notes = upsertDotEnvKey(notes, key, value);
    updated.push(key);
  }

  if (opts.dryRun) {
    console.log(`Would update ${updated.length} keys on ${DEFAULT_LOCAL_ITEM}:`);
    for (const key of updated.sort()) console.log(`  ${key}`);
    return;
  }

  updateItemNotes(item, notes);
  const fresh = getItemOrNull(DEFAULT_LOCAL_ITEM);
  const { map } = secretsFromItem(fresh);
  console.log(`Updated ${DEFAULT_LOCAL_ITEM} with ${updated.length} keys from local .env`);
  console.log("SET in vault:");
  for (const key of [...map.keys()].sort()) {
    if (map.get(key)) console.log(`  ${key}`);
  }
}

main();
