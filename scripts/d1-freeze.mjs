#!/usr/bin/env node
/**
 * Freeze or unfreeze writes to a feature while its data moves to D1 (#191,
 * shared/write-freeze.js). Ops, the website and the Workers refuse writes to
 * a frozen feature from their next request.
 *
 *   npm run d1:freeze -- --env dev --feature events          freeze
 *   npm run d1:freeze -- --env dev --feature events --off    unfreeze
 *   npm run d1:freeze -- --env production --list             what's frozen
 *
 * Writes the `write_freeze:<feature>` row in `_meta` of the D1 database the
 * feature moves into, with that environment's CLOUDFLARE_API_TOKEN (bw-unlock).
 */
import { all, run } from "../shared/d1.js";
import { d1Http } from "../shared/d1-http.js";
import { D1_DATABASES } from "../shared/d1-databases.js";
import {
  FREEZABLE_FEATURES,
  FREEZE_KEY_PREFIX,
} from "../shared/write-freeze.js";
import { cloudflareFor } from "./lib/bitwarden-sm.mjs";
import { loadRepoEnv } from "./lib/load-env.mjs";

function parseArgs(argv) {
  const out = { env: "", feature: "", off: false, list: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--env") out.env = argv[++i] || "";
    else if (argv[i] === "--feature") out.feature = argv[++i] || "";
    else if (argv[i] === "--off") out.off = true;
    else if (argv[i] === "--list") out.list = true;
    else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  if (!D1_DATABASES[out.env])
    throw new Error("--env must be dev or production.");
  if (!out.list && !FREEZABLE_FEATURES[out.feature]) {
    throw new Error(
      `--feature must be one of: ${Object.keys(FREEZABLE_FEATURES).join(", ")}.`,
    );
  }
  return out;
}

function database(env, role) {
  const { token, accountId } = cloudflareFor(env);
  return d1Http({ accountId, databaseId: D1_DATABASES[env][role].id, token });
}

async function main() {
  loadRepoEnv({ app: "web" });
  const opts = parseArgs(process.argv.slice(2));

  if (opts.list) {
    for (const role of new Set(Object.values(FREEZABLE_FEATURES))) {
      const rows = await all(
        database(opts.env, role),
        "SELECT key, value FROM _meta WHERE key LIKE ? AND value <> '' ORDER BY key",
        [`${FREEZE_KEY_PREFIX}%`],
      );
      for (const row of rows) {
        console.log(
          `${opts.env}: ${row.key.slice(FREEZE_KEY_PREFIX.length)} frozen since ${row.value}`,
        );
      }
    }
    console.log(`${opts.env}: done.`);
    return;
  }

  const db = database(opts.env, FREEZABLE_FEATURES[opts.feature]);
  const key = FREEZE_KEY_PREFIX + opts.feature;
  if (opts.off) {
    await run(db, "DELETE FROM _meta WHERE key = ?", [key]);
    console.log(
      `${opts.env}: ${opts.feature} unfrozen. Writes work again from the next request.`,
    );
  } else {
    const since = new Date().toISOString();
    await run(
      db,
      "INSERT INTO _meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
      [key, since],
    );
    console.log(
      `${opts.env}: ${opts.feature} frozen (${since}). Writes to it are refused until --off.`,
    );
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
