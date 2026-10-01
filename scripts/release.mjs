#!/usr/bin/env node
/**
 * Publish a GitHub Release for a production deploy (#50). CI, after the
 * deploy's checks pass:
 *
 *   node scripts/release.mjs --app web --version 2026.10.01+abc1234
 *   node scripts/release.mjs --app ops            (version: today + HEAD)
 *
 * Lists the PRs merged since the app's previous release tag that changed its
 * folders (APPS in lib/release-notes.mjs). When none did, as on a
 * content-only promote, no release is made. The tag is `<prefix><version>`;
 * gh creates it when it doesn't exist. Needs GH_TOKEN (contents: write) and
 * full git history (fetch-depth: 0). --dry-run prints the notes.
 */
import { execFileSync } from "node:child_process";
import { APPS, prNumberOf, releaseNotes } from "./lib/release-notes.mjs";

const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] || "" : "";
};
const DRY_RUN = process.argv.includes("--dry-run");
const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
const gh = (...args) => execFileSync("gh", args, { encoding: "utf8" }).trim();

const appName = arg("--app");
const app = APPS[appName];
if (!app) {
  console.error(`Usage: release.mjs --app ${Object.keys(APPS).join("|")} [--version V] [--dry-run]`);
  process.exit(2);
}

const sha = git("rev-parse", "HEAD");
const version = arg("--version") || `${new Date().toISOString().slice(0, 10).replaceAll("-", ".")}+${sha.slice(0, 7)}`;
const tag = `${app.tagPrefix}${version}`;

// The app's previous release tag, not counting this one (web tags have no
// prefix, so ops-* tags are excluded from its match).
const tags = git("tag", "--merged", "HEAD", "--sort=-creatordate", "--list", `${app.tagPrefix}20*`)
  .split("\n")
  .filter((name) => name && name !== tag);
const previousTag = tags[0] || "";

if (!previousTag) {
  console.log(`No earlier ${app.title} release tag: this one starts the history.`);
}
const range = previousTag ? `${previousTag}..HEAD` : "HEAD~30..HEAD";
const subjects = git("log", "--reverse", "--format=%s", range, "--", ...app.paths).split("\n").filter(Boolean);
const numbers = [...new Set(subjects.map(prNumberOf).filter(Boolean))];

if (!numbers.length) {
  console.log(`No ${app.title} changes since ${previousTag || "the start"}; no release.`);
  process.exit(0);
}

const repo = process.env.GITHUB_REPOSITORY || "gwenda-hackney/ark";
const prs = numbers.map((number) =>
  JSON.parse(gh("pr", "view", String(number), "--repo", repo, "--json", "number,title,headRefName,labels")),
);
const notes = releaseNotes(prs, { previousTag, repo });
const title = `${app.title} ${version.split("+")[0]}`;

if (DRY_RUN) {
  console.log(`${title} (${tag}), since ${previousTag || "start"}:\n\n${notes}`);
  process.exit(0);
}

try {
  gh("release", "view", tag, "--repo", repo);
  console.log(`Release ${tag} already exists; leaving it.`);
} catch {
  gh("release", "create", tag, "--repo", repo, "--target", sha, "--title", title, "--notes", notes);
  console.log(`Released ${title}: ${prs.length} pull request(s).`);
}
