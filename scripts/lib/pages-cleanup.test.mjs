import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { pagesBranch } from "../../.github/scripts/cloudflare-pages-branch.mjs";
import { ROLLBACK_KEEP, planCleanup, slimDeployment, summarise } from "./pages-cleanup.mjs";

const NOW = new Date("2026-11-11T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;

/** A deployment `daysAgo` days old on Pages branch `branch`. */
function dep(id, branch, daysAgo, aliases = []) {
  return { id, branch, createdOn: new Date(NOW.getTime() - daysAgo * DAY).toISOString(), aliases };
}

/** The ids `plan` deletes, and the reason each kept one stays. */
function outcome(plan) {
  return {
    deleted: plan.filter((entry) => entry.action === "delete").map((entry) => entry.deployment.id),
    kept: Object.fromEntries(
      plan.filter((entry) => entry.action === "keep").map((entry) => [entry.deployment.id, entry.reason]),
    ),
  };
}

const sweep = (deployments, extra = {}) =>
  planCleanup({
    deployments,
    liveId: "",
    productionBranch: "main",
    openBranches: [],
    now: NOW,
    olderThanDays: 30,
    ...extra,
  });

const closeBranch = (deployments, branch, extra = {}) =>
  planCleanup({
    deployments,
    liveId: "",
    productionBranch: "main",
    openBranches: [],
    now: NOW,
    branch,
    ...extra,
  });

describe("pages cleanup: weekly sweep", () => {
  it("deletes branch previews older than the cutoff and keeps younger ones", () => {
    const { deleted, kept } = outcome(
      sweep([dep("new", "feat-a", 1), dep("young", "feat-a", 29), dep("old", "feat-b", 31), dep("older", "feat-b", 60)]),
    );
    assert.deepEqual(deleted, ["old", "older"]);
    assert.equal(kept.young, "recent");
  });

  it("keeps the live deployment however old, as after a rollback", () => {
    const deployments = [dep("new", "feat-a", 1), ...Array.from({ length: 8 }, (_, i) => dep(`main-${i}`, "main", 40 + i))];
    const { deleted, kept } = outcome(sweep(deployments, { liveId: "main-7" }));
    assert.equal(kept["main-7"], "live");
    assert.ok(!deleted.includes("main-7"));
  });

  it("keeps a project's newest deployment even when it is old", () => {
    const { deleted, kept } = outcome(sweep([dep("last", "feat-a", 45), dep("before", "feat-b", 50)]));
    assert.equal(kept.last, "newest in project");
    assert.deepEqual(deleted, ["before"]);
  });

  it(`keeps the newest ${ROLLBACK_KEEP} of main, release and preview for rollback, however old`, () => {
    const branchOf = (branch, from) =>
      Array.from({ length: ROLLBACK_KEEP + 2 }, (_, i) => dep(`${branch}-${i}`, branch, from + i));
    const deployments = [
      dep("fresh", "feat-a", 1),
      ...branchOf("release", 40),
      ...branchOf("preview", 40),
      ...branchOf("main", 40),
    ];
    const { deleted, kept } = outcome(sweep(deployments, { productionBranch: "release" }));
    for (const branch of ["release", "preview", "main"]) {
      for (let i = 0; i < ROLLBACK_KEEP; i += 1) assert.equal(kept[`${branch}-${i}`], "rollback", `${branch}-${i}`);
      assert.ok(deleted.includes(`${branch}-${ROLLBACK_KEEP}`));
      assert.ok(deleted.includes(`${branch}-${ROLLBACK_KEEP + 1}`));
    }
  });

  it("treats the project's own production branch as long-lived too", () => {
    const deployments = [dep("fresh", "feat-a", 1), dep("prod-0", "stable", 40), dep("prod-1", "stable", 41)];
    const { kept } = outcome(sweep(deployments, { productionBranch: "stable" }));
    assert.equal(kept["prod-0"], "rollback");
    assert.equal(kept["prod-1"], "rollback");
  });

  it("keeps every deployment of a branch with an open PR, matching git names to Pages names", () => {
    const deployments = [
      dep("fresh", "feat-x", 1),
      dep("pr-old", "feat-240-logo-first", 50),
      dep("pr-older", "feat-240-logo-first", 70),
      // Before CI sanitized names, branch previews kept the git name.
      dep("legacy", "feat/brand-green-palette", 90),
      dep("gone", "feat-closed", 50),
    ];
    const { deleted, kept } = outcome(
      sweep(deployments, { openBranches: ["Feat/240_Logo-First", "feat/brand-green-palette"] }),
    );
    assert.equal(kept["pr-old"], "open PR");
    assert.equal(kept["pr-older"], "open PR");
    assert.equal(kept.legacy, "open PR");
    assert.deepEqual(deleted, ["gone"]);
  });

  it("keeps a deployment that serves a custom domain", () => {
    const deployments = [
      dep("fresh", "feat-a", 1),
      dep("custom", "feat-b", 50, ["https://feat-b.gwenda-web-dev.pages.dev", "https://shop.gwenda.co.uk"]),
      dep("aliased", "feat-c", 50, ["https://feat-c.gwenda-web-dev.pages.dev"]),
    ];
    const { deleted, kept } = outcome(sweep(deployments));
    assert.equal(kept.custom, "custom domain");
    assert.deepEqual(deleted, ["aliased"]);
  });

  it("refuses a cutoff that isn't a positive number of days", () => {
    for (const olderThanDays of [0, -3, Number.NaN, undefined]) {
      assert.throws(() => sweep([], { olderThanDays }), /days/);
    }
  });
});

describe("pages cleanup: a closed PR's branch", () => {
  const deployments = [
    dep("other-new", "feat-other", 0),
    dep("pr-3", "perf-240-logo-first", 1, ["https://perf-240-logo-first.gwenda-web-dev.pages.dev"]),
    dep("pr-2", "perf-240-logo-first", 2),
    dep("pr-1", "perf-240-logo-first", 90),
    dep("other-old", "feat-other", 90),
    dep("main-1", "main", 3),
  ];

  it("deletes all of that branch's deployments, its aliased newest too, and nothing else", () => {
    const plan = closeBranch(deployments, "perf/240-logo-first", { liveId: "main-1" });
    assert.deepEqual(outcome(plan), { deleted: ["pr-3", "pr-2", "pr-1"], kept: {} });
  });

  it("refuses the long-lived aliases: main, release, preview and the production branch", () => {
    for (const branch of ["main", "Main", "release", "preview", "preview/"]) {
      assert.throws(() => closeBranch(deployments, branch), /long-lived/, branch);
    }
    assert.throws(() => closeBranch(deployments, "stable", { productionBranch: "stable" }), /long-lived/);
    assert.throws(() => closeBranch(deployments, "///"), /branch/);
  });

  it("keeps the branch while another open PR still uses it", () => {
    const plan = closeBranch(deployments, "perf/240-logo-first", { openBranches: ["perf/240-logo-first"] });
    const { deleted, kept } = outcome(plan);
    assert.deepEqual(deleted, []);
    assert.equal(kept["pr-3"], "open PR");
  });

  it("keeps the project's newest deployment when it is that branch's", () => {
    const { deleted, kept } = outcome(closeBranch([dep("only", "feat-a", 2), dep("old", "feat-a", 9)], "feat/a"));
    assert.equal(kept.only, "newest in project");
    assert.deepEqual(deleted, ["old"]);
  });
});

describe("pages cleanup: helpers", () => {
  it("names Pages branches as the deploy workflows do", () => {
    assert.equal(pagesBranch("perf/240-logo-first"), "perf-240-logo-first");
    assert.equal(pagesBranch("Feat/Some_Thing--x/"), "feat-some-thing-x");
    assert.equal(pagesBranch("a".repeat(70)).length, 58);
    assert.equal(pagesBranch("///"), "");
  });

  it("reads what it needs from a Cloudflare deployment", () => {
    const raw = {
      id: "e58db0c2-c2a0",
      created_on: "2026-11-11T16:18:36.970484Z",
      aliases: null,
      environment: "preview",
      deployment_trigger: { type: "ad_hoc", metadata: { branch: "fix-240-release-pages" } },
    };
    assert.deepEqual(slimDeployment(raw), {
      id: "e58db0c2-c2a0",
      branch: "fix-240-release-pages",
      createdOn: "2026-11-11T16:18:36.970484Z",
      aliases: [],
    });
    assert.equal(slimDeployment({ id: "x", created_on: "2026-01-01T00:00:00Z" }).branch, "");
  });

  it("sums a plan up: what goes, by branch and date, and why the rest stays", () => {
    const plan = sweep(
      [dep("fresh", "feat-a", 1), dep("b1", "feat-b", 40), dep("b2", "feat-b", 50), dep("c1", "feat-c", 35)],
      { liveId: "fresh" },
    );
    assert.deepEqual(summarise(plan), {
      total: 4,
      deleting: 3,
      oldest: dep("", "", 50).createdOn,
      newest: dep("", "", 35).createdOn,
      byBranch: [
        { branch: "feat-b", count: 2, oldest: dep("", "", 50).createdOn, newest: dep("", "", 40).createdOn },
        { branch: "feat-c", count: 1, oldest: dep("", "", 35).createdOn, newest: dep("", "", 35).createdOn },
      ],
      kept: { live: 1 },
    });
  });
});
