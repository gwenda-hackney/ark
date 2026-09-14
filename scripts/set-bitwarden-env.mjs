#!/usr/bin/env node
/**
 * Set one KEY in a Bitwarden env note, then merge into repo-root `.env` for local.
 *
 * Usage:
 *   npm run env:set -- SANITY_API_TOKEN 'sk...'
 *   npm run env:set -- --env staging SITE_PASSWORD '...'
 *   npm run env:set -- --no-pull CLOUDFLARE_API_TOKEN '...'
 */
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_LOCAL_ITEM,
  ENV_ITEMS,
  applySecretsToTemplate,
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
const EXAMPLE_PATH = resolve(ROOT, ".env.example");
const LOCAL_TEMPLATE = resolve(ROOT, "scripts/env-templates/local.env");

function parseArgs(argv) {
  const out = { env: "local", pull: true, key: null, value: null };
  const rest = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--env") {
      const value = argv[i + 1];
      if (!value || !ENV_ITEMS[value]) {
        throw new Error(`--env requires one of: ${Object.keys(ENV_ITEMS).join(", ")}`);
      }
      out.env = value;
      i += 1;
    } else if (arg === "--no-pull") {
      out.pull = false;
    } else if (arg === "--help" || arg === "-h") {
      out.help = true;
    } else if (arg.startsWith("--")) {
      throw new Error(`Unknown argument: ${arg}`);
    } else {
      rest.push(arg);
    }
  }
  if (!out.help) {
    if (rest.length < 2) {
      throw new Error("Usage: npm run env:set -- KEY value [--env local|staging|production]");
    }
    out.key = rest[0];
    out.value = rest.slice(1).join(" ");
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(out.key)) {
      throw new Error(`Invalid env key: ${out.key}`);
    }
  }
  return out;
}

function writeLocalEnv(secrets) {
  const base = existsSync(ENV_PATH)
    ? readFileSync(ENV_PATH, "utf8")
    : existsSync(LOCAL_TEMPLATE)
      ? readFileSync(LOCAL_TEMPLATE, "utf8")
      : existsSync(EXAMPLE_PATH)
        ? readFileSync(EXAMPLE_PATH, "utf8")
        : "";
  const { content, filled, appended } = applySecretsToTemplate(base || "", secrets);
  if (existsSync(ENV_PATH)) {
    const prev = readFileSync(ENV_PATH, "utf8");
    if (prev !== content) {
      copyFileSync(ENV_PATH, `${ENV_PATH}.bak`);
    }
  }
  writeFileSync(ENV_PATH, content);
  return { filled, appended };
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log(`Set a key on a Bitwarden env note.

Usage:
  node scripts/set-bitwarden-env.mjs KEY value [--env local|staging|production] [--no-pull]

Default --env local updates ark/.env.local and merges into repo-root .env.`);
    return;
  }

  ensureBwInstalled();
  ensureServer();
  ensureSession();
  syncVault();

  const itemName = ENV_ITEMS[opts.env];
  const item = getItemOrNull(itemName);
  if (!item) {
    throw new Error(
      `Missing Bitwarden item "${itemName}". Run: npm run env:seed`,
    );
  }

  const notes = upsertDotEnvKey(item.notes || "", opts.key, opts.value);
  updateItemNotes(item, notes);
  console.log(`Set ${opts.key} on ${itemName}.`);

  if (opts.env === "local" && opts.pull) {
    const fresh = getItemOrNull(itemName);
    const { map } = secretsFromItem(fresh);
    // Ensure the key we just set is present even if empty-string was intentional
    map.set(opts.key, opts.value);
    const { filled, appended } = writeLocalEnv(map);
    console.log(
      `Updated ${ENV_PATH} (filled ${filled}` +
        (appended ? `, appended ${appended}` : "") +
        ").",
    );
  } else if (opts.env !== "local") {
    console.log("Staging/production notes are backups only — not written to local .env.");
  }
}

try {
  main();
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
