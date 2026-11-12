#!/usr/bin/env node
/**
 * Apply the repo's rulesets (.github/rulesets/*.json, #301) to GitHub:
 *
 *   npm run rulesets:apply                  create or update each, by name
 *   npm run rulesets:apply -- --dry-run     print what would change
 *   npm run rulesets:apply -- .github/rulesets/release.json
 *
 * Idempotent: a ruleset that already matches its file is left alone. Uses
 * your gh login, which needs admin on the repo (--repo owner/name, else the
 * checkout's). The why of each rule is in docs: .github/copilot-instructions.md.
 */
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { applyRuleset } from "./lib/rulesets.mjs";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const repoAt = args.indexOf("--repo");
const files = args.filter((arg, i) => !arg.startsWith("--") && i !== repoAt + 1);

const gh = (ghArgs, input) =>
  execFileSync("gh", ghArgs, { encoding: "utf8", input, stdio: ["pipe", "pipe", "inherit"] });
const repo =
  (repoAt >= 0 && args[repoAt + 1]) ||
  process.env.GITHUB_REPOSITORY ||
  gh(["repo", "view", "--json", "nameWithOwner", "--jq", ".nameWithOwner"]).trim();
const api = (method, path, body) => {
  const out = gh(["api", "--method", method, path, ...(body ? ["--input", "-"] : [])], body && JSON.stringify(body));
  return out.trim() ? JSON.parse(out) : null;
};

const dir = ".github/rulesets";
const paths = files.length ? files : readdirSync(dir).filter((name) => name.endsWith(".json")).map((name) => join(dir, name));
for (const path of paths) {
  applyRuleset({ api, repo, ruleset: JSON.parse(readFileSync(path, "utf8")), dryRun });
}
