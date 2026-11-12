import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "vitest";
import { applyRuleset, formatDiff, rulesetDiff } from "./rulesets.mjs";

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const RELEASE = JSON.parse(read(".github/rulesets/release.json"));

const desired = {
  name: "Release branch",
  target: "branch",
  enforcement: "active",
  conditions: { ref_name: { include: ["refs/heads/release"], exclude: [] } },
  bypass_actors: [],
  rules: [
    { type: "deletion" },
    { type: "non_fast_forward" },
    { type: "pull_request", parameters: { required_approving_review_count: 0, allowed_merge_methods: ["merge"] } },
  ],
};

/** As GitHub returns it: ids, links and defaults on top of what was sent. */
const asGitHubReturns = (ruleset) => ({
  id: 42,
  source_type: "Repository",
  source: "o/r",
  _links: { self: { href: "https://api.github.com/repos/o/r/rulesets/42" } },
  created_at: "2026-11-12T10:00:00Z",
  ...structuredClone(ruleset),
  rules: ruleset.rules.map((rule) =>
    rule.type === "pull_request"
      ? { ...rule, parameters: { ...rule.parameters, dismiss_stale_reviews_on_push: false, required_reviewers: [] } }
      : rule,
  ),
});

describe("ruleset diff", () => {
  it("finds nothing to change when GitHub has the ruleset, ids and defaults aside", () => {
    assert.deepEqual(rulesetDiff(asGitHubReturns(desired), desired), []);
  });

  it("shows a changed setting with its old and new value", () => {
    const current = asGitHubReturns(desired);
    current.enforcement = "evaluate";
    current.rules[2].parameters.required_approving_review_count = 1;
    current.rules[2].parameters.allowed_merge_methods = ["merge", "squash", "rebase"];
    assert.equal(
      formatDiff(rulesetDiff(current, desired)),
      [
        '~ enforcement: "evaluate" → "active"',
        "~ rules.pull_request.parameters.required_approving_review_count: 1 → 0",
        '~ rules.pull_request.parameters.allowed_merge_methods: ["merge","rebase","squash"] → ["merge"]',
      ].join("\n"),
    );
  });

  it("adds missing rules and removes rules the file doesn't have", () => {
    const current = asGitHubReturns({ ...desired, rules: [{ type: "deletion" }, { type: "creation" }] });
    const lines = formatDiff(rulesetDiff(current, desired)).split("\n");
    assert.deepEqual(lines.sort(), [
      "+ rules.non_fast_forward",
      '+ rules.pull_request: {"allowed_merge_methods":["merge"],"required_approving_review_count":0}',
      "- rules.creation",
    ]);
  });

  it("ignores the order GitHub lists array items in", () => {
    const current = asGitHubReturns(desired);
    current.rules.reverse();
    current.conditions.ref_name.include = ["refs/heads/release"];
    assert.deepEqual(rulesetDiff(current, desired), []);
  });

  it("compares bypass actors whole", () => {
    const current = asGitHubReturns(desired);
    current.bypass_actors = [{ actor_id: 5, actor_type: "RepositoryRole", bypass_mode: "always" }];
    assert.equal(
      formatDiff(rulesetDiff(current, desired)),
      '~ bypass_actors: [{"actor_id":5,"actor_type":"RepositoryRole","bypass_mode":"always"}] → []',
    );
  });
});

/** A fake GitHub rulesets API: the repo's rulesets; writes are recorded. */
function fakeApi(rulesets = []) {
  const writes = [];
  const reads = [];
  const api = (method, path, body) => {
    if (method === "GET") {
      reads.push(path);
      if (path.startsWith("repos/o/r/rulesets?")) {
        return rulesets.map(({ id, name, target, source_type }) => ({ id, name, target, source_type }));
      }
      const id = Number(path.split("/").at(-1));
      return rulesets.find((ruleset) => ruleset.id === id);
    }
    writes.push({ method, path, body });
    return { id: 99, ...body };
  };
  return { api, writes, reads };
}

describe("applying a ruleset", () => {
  const quiet = () => {};

  it("creates it when the repo has none by that name", () => {
    const gh = fakeApi([{ ...asGitHubReturns(desired), id: 7, name: "Something else" }]);
    const result = applyRuleset({ api: gh.api, repo: "o/r", ruleset: desired, log: quiet });
    assert.equal(result.action, "create");
    assert.deepEqual(gh.writes, [{ method: "POST", path: "repos/o/r/rulesets", body: desired }]);
  });

  it("updates it in place by name, only when something changed", () => {
    const current = asGitHubReturns(desired);
    current.rules[2].parameters.required_approving_review_count = 1;
    const gh = fakeApi([current]);
    const result = applyRuleset({ api: gh.api, repo: "o/r", ruleset: desired, log: quiet });
    assert.equal(result.action, "update");
    assert.deepEqual(gh.writes, [{ method: "PUT", path: "repos/o/r/rulesets/42", body: desired }]);
  });

  it("leaves an up-to-date ruleset alone", () => {
    const gh = fakeApi([asGitHubReturns(desired)]);
    const lines = [];
    const result = applyRuleset({ api: gh.api, repo: "o/r", ruleset: desired, log: (line) => lines.push(line) });
    assert.equal(result.action, "none");
    assert.equal(gh.writes.length, 0);
    assert.match(lines.join("\n"), /up to date/);
  });

  it("only prints the diff on a dry run", () => {
    const current = asGitHubReturns(desired);
    current.enforcement = "disabled";
    const gh = fakeApi([current]);
    const lines = [];
    const result = applyRuleset({ api: gh.api, repo: "o/r", ruleset: desired, dryRun: true, log: (line) => lines.push(line) });
    assert.equal(result.action, "dry-run");
    assert.equal(gh.writes.length, 0);
    assert.match(lines.join("\n"), /~ enforcement: "disabled" → "active"/);
    // And a create on a dry run lists what it would make.
    const empty = fakeApi([]);
    const out = [];
    applyRuleset({ api: empty.api, repo: "o/r", ruleset: desired, dryRun: true, log: (line) => out.push(line) });
    assert.equal(empty.writes.length, 0);
    assert.match(out.join("\n"), /\+ rules\.non_fast_forward/);
  });

  it("looks only at the repo's own rulesets, not ones it inherits", () => {
    const gh = fakeApi([{ ...asGitHubReturns(desired), source_type: "Organization" }]);
    const result = applyRuleset({ api: gh.api, repo: "o/r", ruleset: desired, log: quiet });
    assert.equal(result.action, "create");
    assert.match(gh.reads[0], /includes_parents=false/);
  });
});

describe("the release ruleset", () => {
  const rule = (type) => RELEASE.rules.find((r) => r.type === type);

  it("protects release: PRs only, no force pushes, no deletion, no bypass", () => {
    assert.equal(RELEASE.target, "branch");
    assert.equal(RELEASE.enforcement, "active");
    assert.deepEqual(RELEASE.conditions.ref_name.include, ["refs/heads/release"]);
    assert.deepEqual(RELEASE.bypass_actors, []);
    assert.ok(rule("deletion"));
    assert.ok(rule("non_fast_forward"));
  });

  it("needs no approval (one maintainer) and merges with a merge commit", () => {
    const pr = rule("pull_request").parameters;
    assert.equal(pr.required_approving_review_count, 0);
    // Squash or rebase would put new commits on release, so main would never
    // look released and the next release PR would list everything again.
    assert.deepEqual(pr.allowed_merge_methods, ["merge"]);
  });

  it("requires the Release checks job, which PR checks runs on release PRs", () => {
    const checks = rule("required_status_checks").parameters;
    // Release keeps merge commits main lacks, so main is never "up to date".
    assert.equal(checks.strict_required_status_checks_policy, false);
    assert.deepEqual(
      checks.required_status_checks.map((check) => check.context),
      ["Release checks"],
    );
    const pr = read(".github/workflows/pr.yml");
    assert.match(pr, /branches: \[main, release\]/);
    assert.match(pr, /^ {4}name: Release checks$/m);
  });
});
