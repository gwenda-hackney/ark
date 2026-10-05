#!/usr/bin/env node
/**
 * Create the D1 databases (#127, #190): gwenda-ops, gwenda-website and
 * gwenda-config in each Cloudflare account (production, and gwenda-dev), and
 * record their ids in shared/d1-databases.js. Safe to run again: a database
 * that exists is found by name and kept.
 *
 *   npm run setup:d1                       both accounts
 *   npm run setup:d1 -- --env dev          one account
 *   npm run setup:d1 -- --dry-run          say what would be created
 *
 * Needs bw-unlock: each environment's CLOUDFLARE_API_TOKEN (D1 Write) and
 * CLOUDFLARE_ACCOUNT_ID, from Secrets Manager.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { D1_DATABASES, D1_ROLES } from "../shared/d1-databases.js";
import { cloudflareFor } from "./lib/bitwarden-sm.mjs";
import { loadRepoEnv } from "./lib/load-env.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REGISTRY = resolve(ROOT, "shared/d1-databases.js");
/** Western Europe: where the venue, ops and the website's visitors are. */
const LOCATION_HINT = "weur";

function parseArgs(argv) {
  const out = { envs: ["dev", "production"], dryRun: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--env") out.envs = [argv[++i]];
    else if (argv[i] === "--dry-run") out.dryRun = true;
    else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  for (const env of out.envs)
    if (!D1_DATABASES[env]) throw new Error(`Unknown environment "${env}".`);
  return out;
}

async function api(token, path, init = {}) {
  const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.success) {
    const detail =
      payload?.errors?.map((e) => e.message).join("; ") ||
      `HTTP ${response.status}`;
    throw new Error(`${init.method || "GET"} ${path}: ${detail}`);
  }
  return payload.result;
}

/** Writes one database id into shared/d1-databases.js, inside its environment's block. */
export function withId(source, env, name, id) {
  const start = source.indexOf(`\n  ${env}: {`);
  if (start < 0) throw new Error(`shared/d1-databases.js has no ${env} block.`);
  const end = source.indexOf("\n  },", start);
  const block = source.slice(start, end);
  const line = new RegExp(`(name: "${name}", id: )"[^"]*"`);
  if (!line.test(block))
    throw new Error(`shared/d1-databases.js ${env} has no ${name}.`);
  return (
    source.slice(0, start) +
    block.replace(line, `$1"${id}"`) +
    source.slice(end)
  );
}

async function main() {
  loadRepoEnv({ app: "web" });
  const opts = parseArgs(process.argv.slice(2));
  let registry = readFileSync(REGISTRY, "utf8");

  for (const env of opts.envs) {
    const { token, accountId } = cloudflareFor(env);
    const existing = await api(
      token,
      `/accounts/${accountId}/d1/database?per_page=100`,
    );
    const byName = new Map(existing.map((db) => [db.name, db]));
    for (const role of D1_ROLES) {
      const { name } = D1_DATABASES[env][role];
      let id = byName.get(name)?.uuid;
      if (id) {
        console.log(`${env}: ${name} exists (${id}).`);
      } else if (opts.dryRun) {
        console.log(
          `${env}: would create ${name} (location ${LOCATION_HINT}).`,
        );
        continue;
      } else {
        const created = await api(token, `/accounts/${accountId}/d1/database`, {
          method: "POST",
          body: JSON.stringify({ name, primary_location_hint: LOCATION_HINT }),
        });
        id = created.uuid;
        console.log(`${env}: created ${name} (${id}).`);
      }
      registry = withId(registry, env, name, id);
    }
  }

  if (!opts.dryRun) {
    writeFileSync(REGISTRY, registry);
    console.log(
      "\nIds written to shared/d1-databases.js. Bind them in the wrangler configs (shared/d1-databases.test.js checks).",
    );
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
