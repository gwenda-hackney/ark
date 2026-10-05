/**
 * Every app binds the D1 databases of its own account, with the ids in
 * shared/d1-databases.js (#190). Pages env sections don't inherit bindings,
 * so the website's [env.preview] must repeat them.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "vitest";
import { D1_BINDINGS, D1_DATABASES, D1_ROLES } from "./d1-databases.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** The D1 bindings a wrangler config declares, per section: { "": [...], "env.preview": [...] }. */
function d1Bindings(path) {
  const out = {};
  let current = null;
  for (const raw of readFileSync(resolve(ROOT, path), "utf8").split("\n")) {
    const line = raw.trim();
    const header = line.match(/^\[\[(?:(.+)\.)?d1_databases\]\]$/);
    if (header) {
      current = { section: header[1] ?? "" };
      (out[current.section] ??= []).push(current);
      continue;
    }
    if (line.startsWith("[")) {
      current = null;
      continue;
    }
    const field = line.match(
      /^(binding|database_name|database_id|remote)\s*=\s*"?([^"]*)"?$/,
    );
    if (current && field) current[field[1]] = field[2];
  }
  return out;
}

/** config file → { env, roles, sections } it must bind. */
const APPS = {
  "ops/site/wrangler.toml": {
    env: "production",
    roles: D1_ROLES,
    sections: [""],
  },
  "ops/site/wrangler.dev.toml": { env: "dev", roles: D1_ROLES, sections: [""] },
  "marketing/web/wrangler.toml": {
    env: "production",
    roles: D1_ROLES,
    sections: ["", "env.preview"],
  },
  "marketing/web/wrangler.dev.toml": {
    env: "dev",
    roles: D1_ROLES,
    sections: ["", "env.preview"],
  },
  "marketing/subscribe-mailchimp-sync/wrangler.toml": {
    env: "production",
    roles: ["website"],
    sections: [""],
  },
  "marketing/wifi-captive-portal/wrangler.toml": {
    env: "production",
    roles: ["website"],
    sections: [""],
  },
};

describe("D1 bindings in the wrangler configs", () => {
  it("every database has an id in both accounts, and the accounts differ", () => {
    for (const env of ["production", "dev"]) {
      for (const role of D1_ROLES)
        assert.match(
          D1_DATABASES[env][role].id,
          /^[0-9a-f-]{36}$/,
          `${env} ${role}`,
        );
    }
    for (const role of D1_ROLES)
      assert.notEqual(
        D1_DATABASES.production[role].id,
        D1_DATABASES.dev[role].id,
      );
  });

  for (const [path, { env, roles, sections }] of Object.entries(APPS)) {
    it(`${path} binds its ${env} databases`, () => {
      const found = d1Bindings(path);
      for (const section of sections) {
        const bindings = found[section] ?? [];
        const label = section || "top level";
        assert.deepEqual(
          bindings.map((b) => b.binding).sort(),
          roles.map((role) => D1_BINDINGS[role]).sort(),
          `${path} ${label}`,
        );
        for (const role of roles) {
          const binding = bindings.find((b) => b.binding === D1_BINDINGS[role]);
          assert.equal(
            binding.database_id,
            D1_DATABASES[env][role].id,
            `${path} ${label} ${role} id`,
          );
          assert.equal(
            binding.database_name,
            D1_DATABASES[env][role].name,
            `${path} ${label} ${role} name`,
          );
          // ops:dev runs these files locally: a remote binding would reach the real database.
          assert.equal(
            binding.remote,
            undefined,
            `${path} ${label} ${role} must not be remote`,
          );
        }
      }
    });
  }
});
