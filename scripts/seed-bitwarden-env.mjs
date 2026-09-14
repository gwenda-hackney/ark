#!/usr/bin/env node
/**
 * Seed Bitwarden secure notes from scripts/env-templates/*.env
 * Creates missing items only (does not overwrite existing notes).
 *
 * Usage:
 *   npm run env:seed
 *   npm run env:seed -- --force     # replace notes from templates (destructive)
 *   npm run env:seed -- --env local
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ENV_ITEMS,
  createSecureNote,
  ensureBwInstalled,
  ensureServer,
  ensureSession,
  getItemOrNull,
  syncVault,
  updateItemNotes,
} from "./lib/bitwarden-env.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TEMPLATES = {
  local: resolve(ROOT, "scripts/env-templates/local.env"),
  staging: resolve(ROOT, "scripts/env-templates/staging.env"),
  production: resolve(ROOT, "scripts/env-templates/production.env"),
};

function parseArgs(argv) {
  const out = { force: false, env: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--force") out.force = true;
    else if (arg === "--env") {
      const value = argv[i + 1];
      if (!value || !TEMPLATES[value]) {
        throw new Error(`--env requires one of: ${Object.keys(TEMPLATES).join(", ")}`);
      }
      out.env = value;
      i += 1;
    } else if (arg === "--help" || arg === "-h") {
      out.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return out;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log(`Seed Bitwarden env notes from scripts/env-templates/

Usage:
  node scripts/seed-bitwarden-env.mjs [--force] [--env local|staging|production]

Creates ark/.env.local, ark/.env.staging, ark/.env.production if missing.
Without --force, existing items are left unchanged.`);
    return;
  }

  ensureBwInstalled();
  ensureServer();
  ensureSession();
  syncVault();

  const targets = opts.env ? [opts.env] : Object.keys(TEMPLATES);

  for (const envName of targets) {
    const itemName = ENV_ITEMS[envName];
    const templatePath = TEMPLATES[envName];
    if (!existsSync(templatePath)) {
      throw new Error(`Missing template ${templatePath}`);
    }
    const notes = readFileSync(templatePath, "utf8");
    const existing = getItemOrNull(itemName);

    if (!existing) {
      const created = createSecureNote(itemName, notes);
      console.log(`Created ${itemName} (${created.id}).`);
      continue;
    }

    if (!opts.force) {
      console.log(`Exists ${itemName} — skipped (use --force to replace notes).`);
      continue;
    }

    updateItemNotes(existing, notes);
    console.log(`Replaced notes on ${itemName}.`);
  }

  console.log("Done. Fill secrets with: npm run env:set -- KEY value");
  console.log("Pull local: npm run env:pull");
}

try {
  main();
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
