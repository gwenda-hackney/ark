#!/usr/bin/env node
/**
 * Switch where a feature's data lives (#127, shared/data-store.js). Every
 * runtime reads the flag on its next request, so this is the cutover.
 *
 *   npm run d1:store -- --env dev --feature users --to d1        cut over
 *   npm run d1:store -- --env dev --feature users --to baserow   roll back
 *   npm run d1:store -- --env production --list                  where each one is
 *
 * --to d1 refuses until data-move has imported the feature (moved:<feature>
 * in _meta), so a feature never switches onto an empty database.
 */
import { all, first, run } from "../shared/d1.js";
import { d1Http } from "../shared/d1-http.js";
import { D1_DATABASES } from "../shared/d1-databases.js";
import {
  STORE_FEATURES,
  STORE_KEY_PREFIX,
  STORES,
} from "../shared/data-store.js";
import { cloudflareFor } from "./lib/bitwarden-sm.mjs";
import { loadRepoEnv } from "./lib/load-env.mjs";

export function parseArgs(argv) {
  const out = { env: "", feature: "", to: "", list: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--env") out.env = argv[++i] || "";
    else if (argv[i] === "--feature") out.feature = argv[++i] || "";
    else if (argv[i] === "--to") out.to = argv[++i] || "";
    else if (argv[i] === "--list") out.list = true;
    else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  if (!D1_DATABASES[out.env])
    throw new Error("--env must be dev or production.");
  if (out.list) return out;
  if (!STORE_FEATURES[out.feature])
    throw new Error(
      `--feature must be one of: ${Object.keys(STORE_FEATURES).join(", ")}.`,
    );
  if (!STORES.includes(out.to)) throw new Error("--to must be d1 or baserow.");
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
    for (const [feature, role] of Object.entries(STORE_FEATURES)) {
      const rows = await all(
        database(opts.env, role),
        "SELECT key, value FROM _meta WHERE key IN (?, ?)",
        [STORE_KEY_PREFIX + feature, `moved:${feature}`],
      );
      const store =
        rows.find((r) => r.key.startsWith(STORE_KEY_PREFIX))?.value === "d1"
          ? "d1"
          : "baserow";
      const moved = rows.find((r) => r.key.startsWith("moved:"));
      console.log(
        `${opts.env}: ${feature} on ${store}${moved ? ` (moved ${JSON.parse(moved.value).at})` : ""}`,
      );
    }
    return;
  }

  const db = database(opts.env, STORE_FEATURES[opts.feature]);
  if (opts.to === "d1") {
    const moved = await first(db, "SELECT value FROM _meta WHERE key = ?", [
      `moved:${opts.feature}`,
    ]);
    if (!moved)
      throw new Error(
        `${opts.feature} hasn't been moved into ${opts.env} D1 yet. Run npm run data:move -- --feature ${opts.feature} … --write first.`,
      );
  }
  await run(
    db,
    "INSERT INTO _meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
    [STORE_KEY_PREFIX + opts.feature, opts.to],
  );
  console.log(
    `${opts.env}: ${opts.feature} now on ${opts.to}, from the next request.`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`)
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
