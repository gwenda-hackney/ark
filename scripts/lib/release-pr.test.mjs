import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { parseCommits, releaseBody, releaseList, releasePr, releaseTitle } from "./release-pr.mjs";

const URL = "https://github.com/o/r/pull";
const pr = (number, title, oid, mergedAt = "2026-11-12T10:19:41Z") => ({
  number,
  title,
  url: `${URL}/${number}`,
  mergedAt,
  mergeCommit: { oid },
});

// main's first-parent commits that release lacks, oldest first (two merge
// commits and a squash merge), plus one pushed straight to main.
const LOG = [
  "a".repeat(40) + "\t2026-11-11T22:13:30+00:00\tMerge pull request #294 from o/feat/240-bookings-page",
  "b".repeat(40) + "\t2026-11-12T09:15:34+00:00\tFix a typo",
  "c".repeat(40) + "\t2026-11-12T10:19:32+00:00\tThe record's centre in mustard (#297)",
  "d".repeat(40) + "\t2026-11-12T10:19:41+00:00\tMerge pull request #298 from o/fix/reload-follows-anchor",
].join("\n");

const PRS = [
  // gh lists newest first, and includes PRs already on release.
  pr(298, "A reload of an address with an #anchor lands on the anchor", "d".repeat(40)),
  pr(297, "The record's centre in mustard (#240)", "c".repeat(40), "2026-11-12T10:19:32Z"),
  pr(295, "Already released", "e".repeat(40)),
  pr(294, "One job per place: a Bookings page", "a".repeat(40), "2026-11-11T22:13:30Z"),
];

describe("release PR list", () => {
  it("reads main's first-parent commits", () => {
    const commits = parseCommits(LOG);
    assert.equal(commits.length, 4);
    assert.deepEqual(commits[1], { sha: "b".repeat(40), date: "2026-11-12T09:15:34+00:00", subject: "Fix a typo" });
    assert.deepEqual(parseCommits(""), []);
  });

  it("lists the PRs whose merge commits release lacks, in the order they merged", () => {
    const list = releaseList({ commits: parseCommits(LOG), prs: PRS });
    assert.deepEqual(
      list.prs.map((p) => p.number),
      [294, 297, 298],
    );
    assert.deepEqual(
      list.orphans.map((c) => c.subject),
      ["Fix a typo"],
    );
  });

  it("titles the release by its PR numbers", () => {
    const list = releaseList({ commits: parseCommits(LOG), prs: PRS });
    assert.equal(releaseTitle(list), "Release: #294 #297 #298");
    // Numbers ascending, as release merges have been titled, whatever order they merged in.
    assert.equal(releaseTitle({ prs: [{ number: 293 }, { number: 292 }, { number: 299 }], orphans: [] }), "Release: #292 #293 #299");
    assert.equal(releaseTitle({ prs: [], orphans: [{ sha: "b".repeat(40), subject: "x" }] }), "Release: 1 commit from main");
  });

  it("lists each PR with its link, title and merged date, and commits without a PR", () => {
    const body = releaseBody(releaseList({ commits: parseCommits(LOG), prs: PRS }));
    assert.match(body, /^- \[#294\]\(https:\/\/github\.com\/o\/r\/pull\/294\) One job per place: a Bookings page, merged 2026-11-11$/m);
    assert.match(body, /^- \[#298\]\(https:\/\/github\.com\/o\/r\/pull\/298\) A reload of an address .*, merged 2026-11-12$/m);
    // The issue number a title cites stays; the PR's own number isn't repeated.
    assert.match(body, /\[#297\]\([^)]+\) The record's centre in mustard \(#240\), merged/);
    assert.match(body, /^- `bbbbbbb` Fix a typo$/m);
    assert.ok(body.indexOf("#294") < body.indexOf("#297") && body.indexOf("#297") < body.indexOf("#298"));
  });
});

/** A fake git and gh: answers the read calls, records every call. */
function fakeTools({ log = LOG, prs = PRS, open = [], created = `${URL}/310` } = {}) {
  const calls = [];
  const git = (args) => {
    calls.push(["git", ...args]);
    if (args[0] === "log") return log;
    return "";
  };
  const gh = (args) => {
    calls.push(["gh", ...args]);
    if (args[0] === "pr" && args[1] === "list" && args.includes("merged")) return JSON.stringify(prs);
    if (args[0] === "pr" && args[1] === "list") return JSON.stringify(open);
    if (args[0] === "pr" && args[1] === "create") return created;
    return "";
  };
  const writes = () => calls.filter((c) => c[0] === "gh" && c[1] === "pr" && (c[2] === "create" || c[2] === "edit"));
  return { git, gh, calls, writes };
}

describe("npm run release:pr", () => {
  const quiet = () => {};

  it("says nothing to release when release already has main", () => {
    const tools = fakeTools({ log: "" });
    const lines = [];
    const result = releasePr({ git: tools.git, gh: tools.gh, log: (line) => lines.push(line) });
    assert.equal(result.action, "none");
    assert.match(lines.join("\n"), /nothing to release/i);
    assert.equal(tools.calls.filter((c) => c[0] === "gh").length, 0);
  });

  it("compares the fetched release with main, first parents only", () => {
    const tools = fakeTools();
    releasePr({ git: tools.git, gh: tools.gh, dryRun: true, log: quiet });
    assert.deepEqual(tools.calls[0], ["git", "fetch", "--quiet", "origin", "main", "release"]);
    const log = tools.calls.find((c) => c[1] === "log");
    assert.ok(log.includes("--first-parent"));
    assert.ok(log.includes("origin/release..origin/main"));
  });

  it("asks only for PRs merged since the oldest commit going out", () => {
    const tools = fakeTools();
    releasePr({ git: tools.git, gh: tools.gh, dryRun: true, log: quiet });
    const list = tools.calls.find((c) => c[1] === "pr" && c.includes("merged"));
    assert.equal(list[list.indexOf("--search") + 1], "merged:>=2026-11-10");
    assert.equal(list[list.indexOf("--base") + 1], "main");
  });

  it("opens the PR from main into release", () => {
    const tools = fakeTools();
    const result = releasePr({ git: tools.git, gh: tools.gh, log: quiet });
    assert.equal(result.action, "create");
    assert.equal(result.url, `${URL}/310`);
    const [create] = tools.writes();
    assert.equal(create[create.indexOf("--base") + 1], "release");
    assert.equal(create[create.indexOf("--head") + 1], "main");
    assert.equal(create[create.indexOf("--title") + 1], "Release: #294 #297 #298");
    assert.match(create[create.indexOf("--body") + 1], /\[#297\]/);
  });

  it("updates the open release PR instead of opening another", () => {
    const tools = fakeTools({ open: [{ number: 305, url: `${URL}/305` }] });
    const result = releasePr({ git: tools.git, gh: tools.gh, log: quiet });
    assert.equal(result.action, "update");
    const [edit] = tools.writes();
    assert.deepEqual(edit.slice(0, 4), ["gh", "pr", "edit", "305"]);
    assert.equal(edit[edit.indexOf("--title") + 1], "Release: #294 #297 #298");
  });

  it("prints the title and body on a dry run, and writes nothing", () => {
    const tools = fakeTools({ open: [{ number: 305, url: `${URL}/305` }] });
    const lines = [];
    const result = releasePr({ git: tools.git, gh: tools.gh, dryRun: true, log: (line) => lines.push(line) });
    assert.equal(result.action, "dry-run");
    assert.equal(tools.writes().length, 0);
    const out = lines.join("\n");
    assert.match(out, /Release: #294 #297 #298/);
    assert.match(out, /\[#298\]\(https:\/\/github\.com\/o\/r\/pull\/298\)/);
    assert.match(out, /would update .*\/305/i);
  });
});
