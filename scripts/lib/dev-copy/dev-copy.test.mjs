import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { baserow, baserowCopyCommand } from "./baserow.mjs";
import { copySanityContent, sanityTokens } from "./content.mjs";
import { databaseProvider } from "./database.mjs";
import { COPY_TARGETS, copySteps, copySummary, runCopySteps } from "./index.mjs";

/** A provider that records what it was asked to copy. */
function fakeProvider(calls, { fail = null } = {}) {
  return {
    id: "fake",
    label: "Fake DB",
    databases: ["ops", "website"],
    copy(database, { dryRun }) {
      calls.push(`${database}${dryRun ? " (dry)" : ""}`);
      if (database === fail) throw new Error(`${database} broke`);
    },
  };
}

describe("copySteps", () => {
  const steps = (target, calls = []) =>
    copySteps(target, {
      provider: fakeProvider(calls),
      copyContent: ({ dryRun }) => calls.push(`content${dryRun ? " (dry)" : ""}`),
    });

  it("everything copies content, then each database the provider has", () => {
    assert.deepEqual(
      steps("everything").map((step) => step.id),
      ["content", "ops-data", "website-data"],
    );
  });

  it("each single target runs one step", () => {
    assert.deepEqual(steps("content").map((s) => s.id), ["content"]);
    assert.deepEqual(steps("ops-data").map((s) => s.id), ["ops-data"]);
    assert.deepEqual(steps("website-data").map((s) => s.id), ["website-data"]);
  });

  it("labels data steps with the provider, not a hard-coded name", () => {
    assert.equal(steps("ops-data")[0].label, "Ops database (Fake DB)");
  });

  it("refuses unknown targets and databases the provider lacks", () => {
    assert.throws(() => steps("production"), /Unknown target/);
    const opsOnly = { ...fakeProvider([]), databases: ["ops"] };
    assert.throws(() => copySteps("website-data", { provider: opsOnly }), /has no website database/);
  });

  it("offers the targets the workflow and ops know", () => {
    assert.deepEqual(COPY_TARGETS, ["everything", "content", "ops-data", "website-data"]);
  });
});

describe("runCopySteps", () => {
  it("keeps going after a failed step and reports each", async () => {
    const calls = [];
    const steps = copySteps("everything", {
      provider: fakeProvider(calls, { fail: "ops" }),
      copyContent: () => calls.push("content"),
    });
    const results = await runCopySteps(steps, { dryRun: true });
    assert.deepEqual(calls, ["content", "ops (dry)", "website (dry)"]);
    assert.deepEqual(
      results.map((r) => [r.id, r.ok]),
      [
        ["content", true],
        ["ops-data", false],
        ["website-data", true],
      ],
    );
    const summary = copySummary("everything", results, { dryRun: true });
    assert.match(summary, /dry run/);
    assert.match(summary, /❌ Ops database \(Fake DB\): ops broke/);
  });
});

describe("databaseProvider", () => {
  it("is Baserow today and refuses unknown providers", () => {
    assert.equal(databaseProvider().id, "baserow");
    assert.throws(() => databaseProvider("postgres"), /Unknown database provider "postgres"/);
  });
});

describe("baserow provider", () => {
  it("runs the clone script for the database, wiping the copy's rows", () => {
    const [script, ...args] = baserowCopyCommand("ops");
    assert.match(script, /scripts\/clone-baserow-ops-db\.mjs$/);
    assert.deepEqual(args, ["--force"]);
    assert.deepEqual(baserowCopyCommand("website", { dryRun: true }).slice(1), ["--force", "--dry-run"]);
    assert.throws(() => baserowCopyCommand("config"), /no "config" database/);
  });

  it("throws when the clone script fails", () => {
    const run = () => ({ status: 1 });
    assert.throws(() => baserow.copy("ops", { run }), /ops database failed/);
  });
});

describe("Sanity content", () => {
  it("uses both robot tokens or neither", () => {
    assert.deepEqual(sanityTokens({}), { source: "", target: "" });
    assert.deepEqual(
      sanityTokens({ SANITY_API_TOKEN__PRODUCTION: "p", SANITY_API_TOKEN__DEV: "d" }),
      { source: "p", target: "d" },
    );
    assert.throws(() => sanityTokens({ SANITY_API_TOKEN__PRODUCTION: "p" }), /both/);
  });

  it("exports with the production token and imports with the dev one", () => {
    const calls = [];
    const run = (_bin, args, opts) => {
      calls.push({ args, token: opts.env.SANITY_AUTH_TOKEN });
      return { status: 0 };
    };
    copySanityContent({
      run,
      env: { SANITY_API_TOKEN__PRODUCTION: "prod-token", SANITY_API_TOKEN__DEV: "dev-token" },
      source: "real",
      target: "dev",
    });
    assert.deepEqual(
      calls.map((c) => [c.args[1], c.args.at(-1), c.token]),
      [
        ["export", "real", "prod-token"],
        ["import", "dev", "dev-token"],
      ],
    );
    assert.ok(calls[1].args.includes("--replace"));
  });

  it("refuses to import into the project it reads", () => {
    assert.throws(() => copySanityContent({ source: "same", target: "same" }), /Refusing/);
  });

  it("dry run starts no CLI", () => {
    let ran = false;
    copySanityContent({ dryRun: true, env: {}, run: () => ((ran = true), { status: 0 }) });
    assert.equal(ran, false);
  });
});
