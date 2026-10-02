#!/usr/bin/env node
/**
 * Store secrets pasted into .env in Secrets Manager, then take them out of
 * .env. Every .env line whose name is a known secret (SECRET_OWNERS, any
 * __DEV / __PRODUCTION suffix) is stored in its project, read back to check,
 * and removed from .env. Other lines are left alone. Replaces an existing
 * value only with --replace. Never prints values.
 *
 * Needs bw-unlock (writes with ark-local, never the CI token).
 *
 *   npm run secrets:import-env               # show what it would store
 *   npm run secrets:import-env -- --apply    # store and remove from .env
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseDotEnv } from "../shared/env-file.js";
import { vaultSmAccessToken } from "./lib/bitwarden-env.mjs";
import {
  DEV_PROJECT_NAMES,
  PROJECT_NAMES,
  listAllSmSecrets,
  ownerOf,
  upsertSmSecret,
} from "./lib/bitwarden-sm.mjs";

const ENV_PATH = resolve(dirname(fileURLToPath(import.meta.url)), "..", ".env");
const APPLY = process.argv.includes("--apply");
const REPLACE = process.argv.includes("--replace");

/** The project a key is written to: production for __PRODUCTION, else -dev. */
const projectOf = (key) =>
  key.endsWith("__PRODUCTION")
    ? PROJECT_NAMES[ownerOf(key)]
    : DEV_PROJECT_NAMES[ownerOf(key)];

function main() {
  if (!existsSync(ENV_PATH)) return console.log("No .env; nothing to import.");
  const text = readFileSync(ENV_PATH, "utf8");
  const found = [...parseDotEnv(text)].filter(
    ([key, value]) => ownerOf(key) && String(value).trim(),
  );
  if (!found.length) return console.log("No secrets in .env.");

  const accessToken = vaultSmAccessToken();
  if (!accessToken)
    throw new Error("The vault is locked. Run bw-unlock first.");
  const existing = listAllSmSecrets({ accessToken });
  const done = [];
  for (const [key, raw] of found) {
    const value = String(raw).trim();
    const same = existing.get(key) === value;
    if (existing.has(key) && !same && !REPLACE) {
      console.log(
        `skip    ${key}: already in ${projectOf(key)} with another value (--replace to overwrite)`,
      );
      continue;
    }
    if (!APPLY) {
      console.log(
        `would   ${key} → ${projectOf(key)}${same ? " (already stored)" : ""}`,
      );
      continue;
    }
    if (!same) upsertSmSecret({ key, value, accessToken });
    if (listAllSmSecrets({ accessToken }).get(key) !== value)
      throw new Error(`${key} didn't read back; left in .env.`);
    done.push(key);
    console.log(`stored  ${key} → ${projectOf(key)}`);
  }
  if (!APPLY) return console.log("Run again with --apply.");
  if (!done.length) return;
  const kept = text.split("\n").filter(
    (line) =>
      !done.includes(
        line
          .split("=")[0]
          .replace(/^export\s+/, "")
          .trim(),
      ),
  );
  writeFileSync(ENV_PATH, kept.join("\n"));
  console.log(`Removed ${done.length} line(s) from .env.`);
}

try {
  main();
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
}
