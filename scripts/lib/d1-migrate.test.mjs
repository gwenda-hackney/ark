import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "vitest";
import {
  applyD1Migrations,
  d1MigrationPlan,
  localD1MigrationPlan,
  wranglerConfig,
} from "./d1-migrate.mjs";

const databases = {
  dev: {
    ops: { name: "gwenda-ops", id: "ops-id" },
    website: { name: "gwenda-website", id: "" },
    config: { name: "gwenda-config", id: "cfg-id" },
  },
};

describe("d1MigrationPlan", () => {
  it("applies to databases that exist and skips the rest", () => {
    const plan = d1MigrationPlan("dev", ["ops", "website"], databases);
    assert.equal(plan[0].id, "ops-id");
    assert.match(plan[0].migrationsDir, /db\/ops\/migrations$/);
    assert.match(plan[1].skip, /not created yet/);
  });

  it("refuses unknown environments and roles", () => {
    assert.throws(
      () => d1MigrationPlan("staging", ["ops"], databases),
      /Unknown environment/,
    );
    assert.throws(
      () => d1MigrationPlan("dev", ["menu"], databases),
      /Unknown D1 database role/,
    );
  });
});

describe("wranglerConfig", () => {
  it("names only that database, with its migrations folder", () => {
    const toml = wranglerConfig(d1MigrationPlan("dev", ["ops"], databases)[0]);
    assert.match(toml, /binding = "OPS_DB"/);
    assert.match(toml, /database_name = "gwenda-ops"/);
    assert.match(toml, /database_id = "ops-id"/);
    assert.match(toml, /migrations_dir = ".*db\/ops\/migrations"/);
  });
});

describe("applyD1Migrations", () => {
  /** Records each wrangler call and the config it was given. */
  function fakeWrangler(statuses) {
    const calls = [];
    const run = (_bin, args) => {
      const config = args[args.indexOf("-c") + 1];
      calls.push({ args, config: readFileSync(config, "utf8") });
      return { status: statuses.shift() ?? 0 };
    };
    return { calls, run };
  }
  const quiet = { log: () => {}, wait: async () => {} };

  it("applies each existing database remotely and skips the others", async () => {
    const { calls, run } = fakeWrangler([0, 0]);
    const results = await applyD1Migrations(
      d1MigrationPlan("dev", undefined, databases),
      { run, ...quiet },
    );
    assert.deepEqual(
      results.map((r) => `${r.role}:${r.status}`),
      ["ops:applied", "website:skipped", "config:applied"],
    );
    assert.deepEqual(calls[0].args.slice(0, 6), [
      "d1",
      "migrations",
      "apply",
      "gwenda-ops",
      "--remote",
      "-c",
    ]);
    assert.match(calls[1].config, /gwenda-config/);
  });

  it("retries once, for a deploy racing it to the same migration", async () => {
    const { calls, run } = fakeWrangler([1, 0]);
    const results = await applyD1Migrations(
      d1MigrationPlan("dev", ["ops"], databases),
      { run, ...quiet },
    );
    assert.equal(calls.length, 2);
    assert.equal(results[0].status, "applied");
  });

  it("fails when the retry fails too", async () => {
    const { run } = fakeWrangler([1, 1]);
    await assert.rejects(
      applyD1Migrations(d1MigrationPlan("dev", ["ops"], databases), {
        run,
        ...quiet,
      }),
      /D1 migrations for gwenda-ops failed/,
    );
  });

  it("dry run lists pending migrations without applying or retrying", async () => {
    const { calls, run } = fakeWrangler([0]);
    const results = await applyD1Migrations(
      d1MigrationPlan("dev", ["ops"], databases),
      {
        run,
        dryRun: true,
        ...quiet,
      },
    );
    assert.equal(calls[0].args[2], "list");
    assert.equal(results[0].status, "listed");
  });

  it("local: applies to the local state, with no retry", async () => {
    const { calls, run } = fakeWrangler([1]);
    await assert.rejects(
      applyD1Migrations(d1MigrationPlan("dev", ["ops"], databases), {
        run,
        persistTo: "/tmp/state",
        ...quiet,
      }),
      /D1 migrations for gwenda-ops failed/,
    );
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].args.slice(4, 7), [
      "--local",
      "--persist-to",
      "/tmp/state",
    ]);
    assert.ok(!calls[0].args.includes("--remote"));
  });
});

describe("localD1MigrationPlan", () => {
  it("plans the databases an app's wrangler.toml binds, by their ids", () => {
    const toml = [
      'name = "gwenda-ops"',
      "",
      "[[d1_databases]]",
      'binding = "OPS_DB"',
      'database_name = "gwenda-ops"',
      'database_id = "ops-local-id"',
      "",
      "[[d1_databases]]",
      'binding = "CONFIG_DB"',
      'database_name = "gwenda-config"',
      'database_id = "cfg-local-id"',
      "",
      "[[d1_databases]]",
      'binding = "SOMETHING_ELSE"',
      'database_name = "other"',
      'database_id = "x"',
      "",
      "[ai]",
      'binding = "AI"',
    ].join("\n");
    const plan = localD1MigrationPlan(toml);
    assert.deepEqual(
      plan.map((p) => `${p.role}:${p.name}:${p.id}`),
      ["ops:gwenda-ops:ops-local-id", "config:gwenda-config:cfg-local-id"],
    );
    assert.match(plan[0].migrationsDir, /db\/ops\/migrations$/);
  });

  it("matches the ops app's real config", () => {
    const toml = readFileSync(
      new URL("../../ops/site/wrangler.toml", import.meta.url),
      "utf8",
    );
    assert.deepEqual(
      localD1MigrationPlan(toml).map((p) => p.role),
      ["ops", "website", "config"],
    );
  });
});
