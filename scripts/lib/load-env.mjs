/**
 * Load repo-root env files into process.env.
 *
 * `.env` is shared bootstrap + plain local settings (Bitwarden note). `.env.secrets`
 * holds every secret under its Secrets Manager name (`npm run env:secrets:pull`).
 * Pass `app` to also expose that app's runtime names (APP_SECRETS rename), e.g.
 * web gets BASEROW_API_KEY from BASEROW_WEBSITE_API_KEY, ops from BASEROW_OPS_API_KEY.
 *
 * `.env` never overrides the shell. `override` lets secrets override the shell,
 * which app wrappers use so a stale export cannot shadow the pulled value.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseDotEnv } from "../../marketing/web/functions/_lib/env-pem.js";
import { APP_SECRETS, LOCAL_SECRETS_FILE } from "./bitwarden-sm.mjs";

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function setEnv(key, value, override) {
  if (value === undefined || value === "") return;
  if (override || !process.env[key]) process.env[key] = value;
}

function applyFile(name, override) {
  const path = resolve(REPO_ROOT, name);
  if (!existsSync(path)) return false;
  for (const [key, value] of parseDotEnv(readFileSync(path, "utf8"))) {
    setEnv(key, value, override);
  }
  return true;
}

/**
 * @param {{ app?: "ark" | "ops" | "web", override?: boolean }} [options]
 * @returns {{ secrets: boolean }} whether `.env.secrets` was found
 */
export function loadRepoEnv({ app, override = false } = {}) {
  applyFile(".env", false);
  const secrets = applyFile(LOCAL_SECRETS_FILE, override);
  if (app) {
    const spec = APP_SECRETS[app];
    if (!spec) throw new Error(`Unknown app "${app}".`);
    for (const [runtime, smName] of Object.entries(spec.rename)) {
      setEnv(runtime, process.env[smName], override);
    }
  }
  return { secrets };
}
