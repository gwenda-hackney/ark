import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { baserow, baserowCopyCommand } from "./baserow.mjs";
import { copySanityContent, idsOnlyIn, sanityTokens } from "./content.mjs";
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

  /** A fake Sanity CLI: `ids` per project; records each command. */
  function fakeSanity(ids) {
    const calls = [];
    const run = (_bin, args, opts) => {
      const project = args.at(-1);
      calls.push({ cmd: `${args[0]} ${args[1]}`, args, project, token: opts.env.SANITY_AUTH_TOKEN });
      if (args[1] === "query") return { status: 0, stdout: JSON.stringify(ids[project]) };
      return { status: 0, stdout: "" };
    };
    return { calls, run };
  }
  const tokens = { SANITY_API_TOKEN__PRODUCTION: "prod-token", SANITY_API_TOKEN__DEV: "dev-token" };

  it("exports with the production token, imports with the dev one, then deletes what only dev has", () => {
    const { calls, run } = fakeSanity({
      real: ["a", "drafts.a", "b"],
      dev: ["a", "drafts.a", "b", "old", "drafts.old"],
    });
    copySanityContent({ run, env: tokens, source: "real", target: "dev" });
    assert.deepEqual(
      calls.map((c) => [c.cmd, c.project, c.token]),
      [
        ["dataset export", "real", "prod-token"],
        ["dataset import", "dev", "dev-token"],
        ["documents query", "dev", "dev-token"],
        ["documents query", "real", "prod-token"],
        ["documents delete", "dev", "dev-token"],
      ],
    );
    assert.ok(calls[1].args.includes("--replace"));
    // Drafts count: the queries read raw, not the published-only default.
    assert.ok(calls[2].args.includes("v2021-06-07"));
    assert.deepEqual(calls[4].args.slice(2, 4), ["drafts.old", "old"]);
  });

  it("deletes nothing when dev has nothing extra", () => {
    const { calls, run } = fakeSanity({ real: ["a", "b"], dev: ["a"] });
    copySanityContent({ run, env: tokens, source: "real", target: "dev" });
    assert.ok(!calls.some((c) => c.cmd === "documents delete"));
  });

  it("deletes in batches of 100", () => {
    const dev = Array.from({ length: 250 }, (_, i) => `doc${String(i).padStart(3, "0")}`);
    const { calls, run } = fakeSanity({ real: [], dev });
    copySanityContent({ run, env: tokens, source: "real", target: "dev" });
    const deletes = calls.filter((c) => c.cmd === "documents delete");
    assert.deepEqual(
      deletes.map((c) => c.args.length - 6),
      [100, 100, 50],
    );
  });

  it("idsOnlyIn keeps what production has", () => {
    assert.deepEqual(idsOnlyIn(["c", "a", "b"], ["b"]), ["a", "c"]);
  });

  it("refuses to import into the project it reads", () => {
    assert.throws(() => copySanityContent({ source: "same", target: "same" }), /Refusing/);
  });

  it("dry run only reads: it lists ids but exports, imports and deletes nothing", () => {
    const { calls, run } = fakeSanity({ real: ["a"], dev: ["a", "old"] });
    copySanityContent({ dryRun: true, run, env: tokens, source: "real", target: "dev" });
    assert.deepEqual(
      calls.map((c) => c.cmd),
      ["documents query", "documents query"],
    );
  });
});
