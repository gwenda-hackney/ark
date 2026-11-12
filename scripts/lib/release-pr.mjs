/**
 * The release PR (#301): a pull request from `main` into `release` listing the
 * PRs going out. Merging it pushes `release`, which deploys production ops and
 * prod's preview as a direct push used to.
 *
 * What goes out is main's first-parent history that release lacks: each
 * first-parent commit is a PR's merge (or squash) commit, or a commit pushed
 * straight to main. A PR goes out when its merge commit is one of them.
 *
 * git and gh are passed in as `(args) => stdout`, so tests use fakes.
 */

/** Commits from `git log --format=%H%x09%cI%x09%s`. */
export function parseCommits(log) {
  return String(log || "")
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [sha, date, ...subject] = line.split("\t");
      return { sha, date, subject: subject.join("\t") };
    });
}

/**
 * The PRs going out, in the order they merged, and the commits no PR merged.
 * `commits`: main's first-parent commits release lacks, oldest first. `prs`:
 * merged PRs into main ({ number, title, url, mergedAt, mergeCommit: { oid } }).
 */
export function releaseList({ commits, prs }) {
  const bySha = new Map(prs.filter((pr) => pr.mergeCommit?.oid).map((pr) => [pr.mergeCommit.oid, pr]));
  const out = { prs: [], orphans: [] };
  for (const commit of commits) {
    const pr = bySha.get(commit.sha);
    if (pr) out.prs.push(pr);
    else out.orphans.push(commit);
  }
  return out;
}

/** "Release: #a #b …", numbers ascending as release merges have been titled. */
export function releaseTitle({ prs, orphans }) {
  if (prs.length) {
    const numbers = prs.map((pr) => pr.number).sort((a, b) => a - b);
    return `Release: ${numbers.map((n) => `#${n}`).join(" ")}`;
  }
  return `Release: ${orphans.length} commit${orphans.length === 1 ? "" : "s"} from main`;
}

export function releaseBody({ prs, orphans }) {
  const lines = [
    "Puts `main` on `release`. Merge it with a merge commit: the push to `release` deploys production ops and prod's preview. The live website waits for Web promote.",
  ];
  if (prs.length) {
    lines.push("", `**Going out (${prs.length}):**`, "");
    for (const pr of prs) {
      const title = pr.title.replace(new RegExp(`\\s*\\(#${pr.number}\\)\\s*$`), "");
      lines.push(`- [#${pr.number}](${pr.url}) ${title}, merged ${String(pr.mergedAt).slice(0, 10)}`);
    }
  }
  if (orphans.length) {
    lines.push("", `**Commits on main without a PR (${orphans.length}):**`, "");
    for (const commit of orphans) lines.push(`- \`${commit.sha.slice(0, 7)}\` ${commit.subject}`);
  }
  lines.push("", "Made by `npm run release:pr`; run it again to update this list.");
  return lines.join("\n");
}

/** The UTC day before an ISO date: a safe lower bound for GitHub's merged: search. */
function dayBefore(iso) {
  return new Date(new Date(iso).getTime() - 86_400_000).toISOString().slice(0, 10);
}

/**
 * Open or update the release PR. Returns { action, title, body, url }, where
 * action is "none" (release has main), "create", "update" or "dry-run".
 */
export function releasePr({ git, gh, dryRun = false, log = console.log, remote = "origin", base = "release", head = "main" }) {
  git(["fetch", "--quiet", remote, head, base]);
  const range = `${remote}/${base}..${remote}/${head}`;
  const commits = parseCommits(git(["log", "--first-parent", "--reverse", "--format=%H%x09%cI%x09%s", range]));
  if (!commits.length) {
    log(`Nothing to release: ${base} already has ${head}.`);
    return { action: "none" };
  }

  const prs = JSON.parse(
    gh([
      "pr", "list",
      "--base", head,
      "--state", "merged",
      "--search", `merged:>=${dayBefore(commits[0].date)}`,
      "--limit", "200",
      "--json", "number,title,url,mergedAt,mergeCommit",
    ]),
  );
  const list = releaseList({ commits, prs });
  const title = releaseTitle(list);
  const body = releaseBody(list);

  const [open] = JSON.parse(
    gh(["pr", "list", "--base", base, "--head", head, "--state", "open", "--limit", "1", "--json", "number,url"]),
  );
  if (dryRun) {
    log(open ? `Dry run: would update ${open.url}` : `Dry run: would open a PR from ${head} into ${base}.`);
    log(`\n${title}\n\n${body}`);
    return { action: "dry-run", title, body, url: open?.url || "" };
  }
  if (open) {
    gh(["pr", "edit", String(open.number), "--title", title, "--body", body]);
    log(`Updated ${open.url}\n${title}`);
    return { action: "update", title, body, url: open.url };
  }
  const url = gh(["pr", "create", "--base", base, "--head", head, "--title", title, "--body", body]).trim();
  log(`Opened ${url}\n${title}`);
  return { action: "create", title, body, url };
}
