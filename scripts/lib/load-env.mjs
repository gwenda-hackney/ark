/**
 * Load repo-root env files into process.env for one-off scripts.
 *
 * `.env` is shared bootstrap (Bitwarden token, Sanity project, plain local
 * settings). Credentials come from the SM pulls: `.env.ark` (Cloudflare) and
 * `.env.web` / `.env.ops` (app runtimes). Later files win over earlier ones;
 * values already exported in the shell win over all of them.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseDotEnv } from "../../marketing/web/functions/_lib/env-pem.js";

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

/** @param {Array<".env" | ".env.ark" | ".env.web" | ".env.ops">} files */
export function loadRepoEnv(files = [".env", ".env.ark"]) {
  const shell = new Set(Object.keys(process.env));
  for (const name of files) {
    const path = resolve(REPO_ROOT, name);
    if (!existsSync(path)) continue;
    for (const [key, value] of parseDotEnv(readFileSync(path, "utf8"))) {
      if (!value || shell.has(key)) continue;
      process.env[key] = value;
    }
  }
}
