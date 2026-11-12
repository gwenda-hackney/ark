import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { groupOf, prNumberOf, releaseNotes, releasePrOf } from "./release-notes.mjs";

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

  it("finds the release PR among the PRs GitHub lists for the release commit", () => {
    // repos/{repo}/commits/{sha}/pulls: a commit from main is in its own PR
    // too; only a merged PR into release carried it to production.
    const pulls = [
      { number: 298, title: "A reload lands on the anchor", base: { ref: "main" }, merged_at: "2026-11-12T10:19:41Z", html_url: "https://github.com/o/r/pull/298" },
      { number: 311, title: "Release: #298", base: { ref: "release" }, merged_at: null, html_url: "https://github.com/o/r/pull/311" },
      { number: 310, title: "Release: #297 #298", base: { ref: "release" }, merged_at: "2026-11-12T11:00:00Z", html_url: "https://github.com/o/r/pull/310" },
    ];
    assert.deepEqual(releasePrOf(pulls), { number: 310, title: "Release: #297 #298", url: "https://github.com/o/r/pull/310" });
    // A release merged straight into release, before release PRs.
    assert.equal(releasePrOf([]), null);
    assert.equal(releasePrOf(pulls.slice(0, 2)), null);
  });

  it("starts with the release PR, then the PRs it included", () => {
    const prs = [{ number: 297, title: "Mustard record", headRefName: "feat/240-record" }];
    const notes = releaseNotes(prs, {
      releasePr: { number: 310, title: "Release: #297", url: "https://github.com/o/r/pull/310" },
    });
    assert.equal(notes, "Release PR: [#310](https://github.com/o/r/pull/310)\n\n### New\n\n- Mustard record (#297)");
  });

  it("keeps today's notes when no release PR carried the commit", () => {
    const prs = [{ number: 297, title: "Mustard record", headRefName: "feat/240-record" }];
    assert.equal(releaseNotes(prs, { releasePr: null }), releaseNotes(prs));
    assert.equal(releaseNotes(prs), "### New\n\n- Mustard record (#297)");
  });
});
