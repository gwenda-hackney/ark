#!/usr/bin/env node
/**
 * Move one feature's data between repositories (#127, scripts/lib/data-move).
 *
 *   npm run data:move -- --feature events --from baserow:production --to d1:production          dry run
 *   npm run data:move -- --feature events --from baserow:production --to d1:production --write  for real
 *   npm run data:move -- --feature events --from d1:production --to d1:dev --write
 *
 * A dry run reads the source and imports into a local SQLite database with
 * the real migrations (shared/testing/d1-sqlite.js), so it proves the copy
 * without touching the target. --write imports into the target D1, which:
 * - into production, needs the feature frozen first (npm run d1:freeze);
 * - logs a Time Travel bookmark first, to restore with
 *   `wrangler d1 time-travel restore <db> --bookmark <bookmark>`;
 * - checks foreign keys, and records the move in _meta (moved:<feature>).
 * A copy out of production (into dev) leaves behind what points at
 * production's own things, such as each series' Drive folder, and says so:
 * dev shares production's Google account and would act on the real ones.
 * Secrets come from Secrets Manager by name (bw-unlock), per environment.
 */
import { first, run } from "../shared/d1.js";
import { d1Http } from "../shared/d1-http.js";
import { D1_DATABASES } from "../shared/d1-databases.js";
import { createTestD1 } from "../shared/testing/d1-sqlite.js";
import { FREEZE_KEY_PREFIX } from "../shared/write-freeze.js";
import { cloudflareFor, loadAppSecretsFromSm } from "./lib/bitwarden-sm.mjs";
import { featureFor, leavesProduction } from "./lib/data-move/features.mjs";
import { describeMove, moveFeature } from "./lib/data-move/index.mjs";
import { describeMissing, missingSchema, rehearsalCopy } from "./lib/d1-rehearsal.mjs";
import { loadRepoEnv } from "./lib/load-env.mjs";

const ENVS = ["dev", "production"];

export function parseArgs(argv) {
  const out = { feature: "", from: null, to: null, write: false };
  const side = (value, flag) => {
    const [kind, env] = String(value || "").split(":");
    if (!kind || !ENVS.includes(env))
      throw new Error(
        `${flag} must be <baserow|d1>:<dev|production>, e.g. baserow:production.`,
      );
    return { kind, env };
  };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--feature") out.feature = argv[++i] || "";
    else if (argv[i] === "--from") out.from = side(argv[++i], "--from");
    else if (argv[i] === "--to") out.to = side(argv[++i], "--to");
    else if (argv[i] === "--write") out.write = true;
    else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  if (!out.feature || !out.from || !out.to)
    throw new Error("Needs --feature, --from and --to.");
  if (out.to.kind !== "d1")
    throw new Error("--to must be d1: data only ever moves onto D1.");
  if (out.from.kind === out.to.kind && out.from.env === out.to.env)
    throw new Error("--from and --to are the same.");
  return out;
}

function d1For(env, role) {
  const { token, accountId } = cloudflareFor(env);
  const databaseId = D1_DATABASES[env][role].id;
  return {
    db: d1Http({ accountId, databaseId, token }),
    accountId,
    databaseId,
    token,
  };
}

function runtimeEnv(app, env) {
  const { values } = loadAppSecretsFromSm(app, env);
  return { ...Object.fromEntries(values), SITE_ENV: env };
}

/**
 * A D1 source as this code can read it. Production's schema is behind a
 * branch that adds a column until the branch deploys, and the adapters name
 * every column, so the source is read into a copy with the newest schema
 * (d1-rehearsal.mjs: columns it lacks take their defaults). Only reads.
 */
async function readableD1(db, feature, log) {
  if (!feature.tables) return db;
  const missing = await missingSchema(db, feature.role, feature.tables);
  if (!missing.length) return db;
  log(`the source is missing ${describeMissing(missing)}: read through a copy with the newest schema, where they take their defaults`);
  return (await rehearsalCopy(db, feature.role, feature.tables)).db;
}

/**
 * The move between two sides, as main runs it. A copy out of production
 * leaves behind what the feature says points at production's own things
 * (features.mjs `detach`): the target's code would act on the real ones.
 */
export function moveBetween({ feature, from, to, source, target, log }) {
  const detach = leavesProduction(from, to) ? feature.detach : undefined;
  return moveFeature({ source, target, keep: feature.keep, detach, log });
}

async function bookmark({ accountId, databaseId, token }) {
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/time_travel/bookmark`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.result?.bookmark)
    throw new Error(`Could not get a Time Travel bookmark (${res.status}).`);
  return body.result.bookmark;
}

async function main() {
  loadRepoEnv({ app: "web" });
  const opts = parseArgs(process.argv.slice(2));
  const feature = featureFor(opts.feature);
  const label = `${opts.feature} ${opts.from.kind}:${opts.from.env} → d1:${opts.to.env}${opts.write ? "" : " (dry run)"}`;
  const log = (line) => console.log(`${label}: ${line}`);

  const make = feature.adapters[opts.from.kind];
  if (!make)
    throw new Error(`${opts.feature} has no ${opts.from.kind} adapter.`);
  const source =
    opts.from.kind === "d1"
      ? make({ db: await readableD1(d1For(opts.from.env, feature.role).db, feature, log) })
      : make({ env: runtimeEnv(feature.app, opts.from.env) });

  let target;
  let remote = null;
  if (!opts.write) {
    target = feature.adapters.d1({ db: createTestD1(feature.role) });
  } else {
    remote = d1For(opts.to.env, feature.role);
    if (opts.to.env === "production" && feature.freeze !== false) {
      const frozen = await first(
        remote.db,
        "SELECT value FROM _meta WHERE key = ? AND value <> ''",
        [FREEZE_KEY_PREFIX + opts.feature],
      );
      if (!frozen)
        throw new Error(
          `${opts.feature} isn't frozen in production. Run npm run d1:freeze -- --env production --feature ${opts.feature} first.`,
        );
    }
    log(`Time Travel bookmark before the import: ${await bookmark(remote)}`);
    target = feature.adapters.d1({ db: remote.db });
  }

  const moved = await moveBetween({ feature, from: opts.from, to: opts.to, source, target, log });
  const { counts } = moved;

  if (remote) {
    const broken =
      (await remote.db.prepare("PRAGMA foreign_key_check").all()).results || [];
    if (broken.length)
      throw new Error(
        `Foreign key check failed: ${broken.length} row(s) point at nothing.`,
      );
    await run(
      remote.db,
      "INSERT INTO _meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
      [
        `moved:${opts.feature}`,
        JSON.stringify({
          from: `${opts.from.kind}:${opts.from.env}`,
          at: new Date().toISOString(),
          counts,
          ...(Object.keys(moved.detached).length ? { detached: moved.detached } : {}),
        }),
      ],
    );
  }
  log(
    `done: ${describeMove(moved)}${opts.write ? "" : ". Nothing written; add --write to import."}`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`)
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
