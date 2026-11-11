#!/usr/bin/env node
/**
 * Read or set one setting's row in an environment's config database (D1
 * `gwenda-config`, docs/config.md), for the settings no ops page edits.
 *
 *   npm run config:set -- --env production --key website.auto_update              show it
 *   npm run config:set -- --env production --key website.auto_update --value off  set it
 *   npm run config:set -- --env production --key website.auto_update --value ""   back to the default
 *
 * Only settings shared/config.js knows (SETTINGS), written as the app does
 * (shared/config.js setSetting): the environment's own row, with the
 * setting's Service. Apps cache settings for a minute, so a change is read
 * within a minute. With that environment's CLOUDFLARE_API_TOKEN (bw-unlock).
 */
import { SETTINGS } from "../shared/config.js";
import { d1ConfigRepository } from "../shared/config-adapters/d1-config.js";
import { first } from "../shared/d1.js";
import { d1Http } from "../shared/d1-http.js";
import { D1_DATABASES } from "../shared/d1-databases.js";
import { STORE_KEY_PREFIX } from "../shared/data-store.js";
import { cloudflareFor } from "./lib/bitwarden-sm.mjs";
import { loadRepoEnv } from "./lib/load-env.mjs";

export function parseArgs(argv) {
  const out = { env: "", key: "", value: undefined };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--env") out.env = argv[++i] || "";
    else if (argv[i] === "--key") out.key = argv[++i] || "";
    else if (argv[i] === "--value") {
      if (i + 1 >= argv.length) throw new Error('--value needs a value ("" for none).');
      out.value = argv[++i];
    } else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  if (!D1_DATABASES[out.env]) throw new Error("--env must be dev or production.");
  if (!SETTINGS[out.key]) throw new Error(`--key must be a setting: ${Object.keys(SETTINGS).join(", ")}.`);
  return out;
}

/**
 * Show the environment's row for `key`, or set it when `value` is given.
 * @param {any} db  the environment's config database
 * @returns {Promise<{ before: string | null, after: string | null }>}  null: no row
 */
export async function settingRow(db, { env, key, value }) {
  const stored = await first(db, "SELECT value FROM _meta WHERE key = ?", [`${STORE_KEY_PREFIX}config`]);
  if (stored?.value !== "d1") {
    throw new Error(`${env}'s settings aren't on D1 (npm run d1:store -- --env ${env} --list): edit the Gwenda Config table in Baserow instead.`);
  }
  const repo = d1ConfigRepository(db);
  const slot = { name: key, env, service: SETTINGS[key].service };
  const before = (await repo.find(slot))?.value ?? null;
  if (value === undefined) return { before, after: before };
  return { before, after: (await repo.set({ ...slot, value })).value };
}

async function main() {
  loadRepoEnv({ app: "web" });
  const opts = parseArgs(process.argv.slice(2));
  const { token, accountId } = cloudflareFor(opts.env);
  const db = d1Http({ accountId, databaseId: D1_DATABASES[opts.env].config.id, token });
  const { before, after } = await settingRow(db, opts);
  const show = (text) => (text === null ? "not set (no row)" : JSON.stringify(text));
  if (opts.value === undefined) console.log(`${opts.env}: ${opts.key} is ${show(before)}.`);
  else console.log(`${opts.env}: ${opts.key} was ${show(before)}, is now ${show(after)}. Apps read it within a minute.`);
}

if (import.meta.url === `file://${process.argv[1]}`)
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
