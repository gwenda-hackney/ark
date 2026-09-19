#!/usr/bin/env node
/**
 * Pull local secrets from Bitwarden into repo-root `.env`.
 *
 * Vault item (default name `ark/.env.local`):
 *   - Notes: dotenv body (KEY=value lines; comments OK)
 *   - Optional custom fields: field name = env key, value = secret
 *
 * Usage:
 *   npm run env:pull
 *   npm run env:pull -- --dry-run
 *   npm run env:pull -- --replace
 *   npm run env:pull -- --item "ark/.env.staging"
 *
 * Auth: bw login + bw-unlock (session persists in the container)
 * Overrides: BW_ARK_ENV_ITEM, BW_SERVER, BW_SESSION, BW_PASSWORD, BW_SESSION_FILE
 */
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseDotEnv } from "../marketing/web/functions/_lib/env-pem.js";
import {
  DEFAULT_LOCAL_ITEM,
  DEFAULT_SERVER,
  applySecretsToTemplate,
  ensureBwInstalled,
  ensureServer,
  ensureSession,
  getItemOrNull,
  secretsFromItem,
  syncVault,
} from "./lib/bitwarden-env.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ENV_PATH = resolve(ROOT, ".env");
const EXAMPLE_PATH = resolve(ROOT, ".env.example");
const LOCAL_TEMPLATE = resolve(ROOT, "scripts/env-templates/local.env");

function parseArgs(argv) {
  const out = {
    dryRun: false,
    replace: false,
    item: process.env.BW_ARK_ENV_ITEM?.trim() || DEFAULT_LOCAL_ITEM,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--dry-run") out.dryRun = true;
    else if (arg === "--replace") out.replace = true;
    else if (arg === "--item") {
      const value = argv[i + 1];
      if (!value || value.startsWith("--")) {
        throw new Error("--item requires a vault item name");
      }
      out.item = value;
      i += 1;
    } else if (arg === "--help" || arg === "-h") {
      out.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return out;
}

function printHelp() {
  console.log(`Pull Bitwarden secrets into ${ENV_PATH}

Usage:
  node scripts/pull-env-from-bitwarden.mjs [--dry-run] [--replace] [--item NAME]

Default item: ${DEFAULT_LOCAL_ITEM}
EU server:    ${DEFAULT_SERVER}

Seed empty notes first: npm run env:seed
Set one key:           npm run env:set -- KEY value
Push local .env → vault: npm run env:push`);
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    printHelp();
    return;
  }

  ensureBwInstalled();
  ensureServer();
  ensureSession();
  syncVault();

  const item = getItemOrNull(opts.item);
  if (!item) {
    throw new Error(
      `Could not find Bitwarden item "${opts.item}".\n` +
        "Run: npm run env:seed\n" +
        "Or create a Secure Note with that name (Notes = dotenv body).",
    );
  }

  const { map: secrets, notes } = secretsFromItem(item);

  if (secrets.size === 0 && !notes.trim()) {
    throw new Error(
      `Bitwarden item "${opts.item}" has empty Notes and no usable custom fields.`,
    );
  }

  let content;
  let summary;

  if (opts.replace) {
    if (!notes.trim()) {
      throw new Error(
        "--replace needs a Notes body on the vault item (custom fields alone are not enough).",
      );
    }
    content = notes.endsWith("\n") ? notes : `${notes}\n`;
    summary = `replace (${[...parseDotEnv(notes)].length} keys from notes)`;
  } else {
    const base = existsSync(ENV_PATH)
      ? readFileSync(ENV_PATH, "utf8")
      : existsSync(LOCAL_TEMPLATE)
        ? readFileSync(LOCAL_TEMPLATE, "utf8")
        : existsSync(EXAMPLE_PATH)
          ? readFileSync(EXAMPLE_PATH, "utf8")
          : "";
    if (!base && secrets.size === 0) {
      throw new Error("No .env / template to merge into, and Notes were empty.");
    }
    if (!base) {
      content = `${[...secrets.entries()].map(([k, v]) => `${k}=${v}`).join("\n")}\n`;
      summary = `wrote ${secrets.size} keys (no local template)`;
    } else {
      const result = applySecretsToTemplate(base, secrets);
      content = result.content;
      summary =
        `filled ${result.filled} keys` +
        (result.appended ? `, appended ${result.appended}` : "");
    }
  }

  const keys = [...secrets.keys()].sort();
  console.log(
    `Item "${item.name}" → ${keys.length} secret key(s)` +
      (keys.length ? `: ${keys.join(", ")}` : " (seed template only)"),
  );

  if (opts.dryRun) {
    console.log(`Dry run (${summary}). Would write ${ENV_PATH}`);
    return;
  }

  if (existsSync(ENV_PATH)) {
    const prev = readFileSync(ENV_PATH, "utf8");
    if (prev === content) {
      console.log(`.env already up to date (${summary}).`);
      return;
    }
    const bak = `${ENV_PATH}.bak`;
    copyFileSync(ENV_PATH, bak);
    console.log(`Backed up previous .env → ${bak}`);
  }

  writeFileSync(ENV_PATH, content);
  console.log(`Wrote ${ENV_PATH} (${summary}).`);
}

try {
  main();
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
