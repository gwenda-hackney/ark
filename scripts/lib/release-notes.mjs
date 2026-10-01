/**
 * Release notes for a production release (#50): the pull requests merged since
 * the app's previous release, grouped by what they did. The PR title is the
 * line, so titles are written for someone who runs Gwenda. A PR's branch
 * prefix says its group (feat/ → New, fix/ → Fixes, anything else → Behind the
 * scenes); an `enhancement` or `bug` label overrides it, and `skip-changelog`
 * leaves it out.
 */

export const APPS = {
  web: {
    title: "Website",
    tagPrefix: "",
    paths: ["marketing/web", "marketing/studio", "shared", "migrations"],
  },
  ops: {
    title: "Ops",
    tagPrefix: "ops-",
    paths: ["ops/site", "shared", "migrations"],
  },
};

const GROUPS = ["New", "Fixes", "Behind the scenes"];

/** The PR number a squash-merge subject ends with: "Fix x (#43) (#103)" → 103. */
export function prNumberOf(subject) {
  const all = [...String(subject).matchAll(/\(#(\d+)\)/g)];
  return all.length ? Number(all.at(-1)[1]) : 0;
}

export function groupOf(pr) {
  const labels = (pr.labels || []).map((label) => label.name || label);
  if (labels.includes("skip-changelog")) return "";
  if (labels.includes("enhancement")) return "New";
  if (labels.includes("bug")) return "Fixes";
  const prefix = String(pr.headRefName || "").split("/")[0];
  if (prefix === "feat") return "New";
  if (prefix === "fix") return "Fixes";
  return "Behind the scenes";
}

/** Markdown notes from PRs ({ number, title, headRefName, labels }), oldest first. */
export function releaseNotes(prs, { previousTag = "", repo = "" } = {}) {
  const groups = Object.fromEntries(GROUPS.map((group) => [group, []]));
  for (const pr of prs) {
    const group = groupOf(pr);
    if (group) groups[group].push(`- ${pr.title.replace(/\s*\(#\d+\)\s*$/, "")} (#${pr.number})`);
  }
  const sections = GROUPS.filter((group) => groups[group].length).map(
    (group) => `### ${group}\n\n${groups[group].join("\n")}`,
  );
  if (!sections.length) sections.push("Nothing to list: only changes left out of the notes.");
  if (previousTag && repo) {
    sections.push(`Compare: https://github.com/${repo}/compare/${encodeURIComponent(previousTag)}...HEAD`);
  }
  return sections.join("\n\n");
}
