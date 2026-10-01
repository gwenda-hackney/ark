import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { groupOf, prNumberOf, releaseNotes } from "./release-notes.mjs";

describe("release notes", () => {
  it("takes the PR number a squash merge ends with", () => {
    assert.equal(prNumberOf("Fix the header overlapping (#43) (#103)"), 103);
    assert.equal(prNumberOf("Use three environments (#112)"), 112);
    assert.equal(prNumberOf("Merge main into release"), 0);
  });

  it("groups by branch prefix, with labels overriding", () => {
    assert.equal(groupOf({ headRefName: "feat/18-auto-rollback" }), "New");
    assert.equal(groupOf({ headRefName: "fix/15-safe-email" }), "Fixes");
    assert.equal(groupOf({ headRefName: "chore/remove-x" }), "Behind the scenes");
    assert.equal(groupOf({ headRefName: "chore/x", labels: [{ name: "bug" }] }), "Fixes");
    assert.equal(groupOf({ headRefName: "feat/x", labels: [{ name: "skip-changelog" }] }), "");
  });

  it("lists each group's PRs by title, without the repeated number", () => {
    const notes = releaseNotes([
      { number: 103, title: "Fix the header overlapping (#43)", headRefName: "fix/43-header" },
      { number: 110, title: "Roll back automatically", headRefName: "feat/18-rollback" },
      { number: 111, title: "Fix the Workers deploys", headRefName: "fix/workers" },
      { number: 114, title: "Remove the old Worker", headRefName: "chore/remove" },
    ]);
    assert.equal(
      notes,
      [
        "### New\n\n- Roll back automatically (#110)",
        "### Fixes\n\n- Fix the header overlapping (#103)\n- Fix the Workers deploys (#111)",
        "### Behind the scenes\n\n- Remove the old Worker (#114)",
      ].join("\n\n"),
    );
  });

  it("links the comparison with the previous release", () => {
    const notes = releaseNotes([{ number: 1, title: "A", headRefName: "feat/a" }], {
      previousTag: "2026.09.26+ae2e3ec",
      repo: "o/r",
    });
    assert.match(notes, /compare\/2026\.09\.26%2Bae2e3ec\.\.\.HEAD$/);
  });
});
