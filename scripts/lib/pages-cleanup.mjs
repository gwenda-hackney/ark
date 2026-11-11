/**
 * Which Cloudflare Pages deployments to delete (scripts/pages-cleanup.mjs).
 * Pure: given a project's deployments, the branches with an open PR and the
 * time, it says what goes and why the rest stays.
 *
 * Two modes:
 *   branch         a closed PR's branch: all its deployments, whatever their age
 *   olderThanDays  the weekly sweep: everything older than that many days
 *
 * Both always keep, in this order of reasons:
 *   live               the deployment the project serves now (canonical; older
 *                      than the newest after a rollback)
 *   custom domain      an alias off pages.dev
 *   newest in project  so no project is ever left empty
 *   rollback           the newest ROLLBACK_KEEP of each long-lived alias
 *   open PR            any deployment of a branch whose PR is still open
 *   recent             (sweep) younger than the cutoff
 */
import { pagesBranch } from "../../.github/scripts/cloudflare-pages-branch.mjs";

/**
 * Pages branches the workflows deploy as long-lived sites, besides each
 * project's production branch: main (dev websites, ops, brand), release
 * (gwenda.co.uk) and preview (the dev and production previews of the website).
 */
export const LONG_LIVED_BRANCHES = ["main", "release", "preview"];

/**
 * How many of each long-lived alias's newest deployments stay, however old.
 * pages-rollback.mjs steps back one: to the deployment live before a deploy.
 * So the live one and that one, plus three more to roll back to by hand in the
 * dashboard.
 */
export const ROLLBACK_KEEP = 5;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * @typedef {{ id: string, branch: string, createdOn: string, aliases: string[] }} Deployment
 * @typedef {{ deployment: Deployment, action: "delete" | "keep", reason: string }} PlanEntry
 */

/** What the plan needs from a Cloudflare deployment object. @returns {Deployment} */
export function slimDeployment(raw) {
  return {
    id: raw.id,
    branch: raw.deployment_trigger?.metadata?.branch || "",
    createdOn: raw.created_on,
    aliases: raw.aliases || [],
  };
}

const newestFirst = (a, b) => (a.createdOn < b.createdOn ? 1 : a.createdOn > b.createdOn ? -1 : 0);

function onCustomDomain(deployment) {
  return deployment.aliases.some((alias) => {
    try {
      return !new URL(alias).hostname.endsWith(".pages.dev");
    } catch {
      return true;
    }
  });
}

/**
 * Decide each deployment's fate. In branch mode the plan holds that branch's
 * deployments only; in a sweep, every deployment.
 *
 * @param {{
 *   deployments: Deployment[],
 *   liveId: string,
 *   productionBranch: string,
 *   openBranches: string[],
 *   now: Date,
 *   branch?: string,
 *   olderThanDays?: number,
 *   rollbackKeep?: number,
 * }} options
 * @returns {PlanEntry[]} newest first
 */
export function planCleanup({
  deployments,
  liveId,
  productionBranch,
  openBranches,
  now,
  branch,
  olderThanDays,
  rollbackKeep = ROLLBACK_KEEP,
}) {
  const longLived = new Set([...LONG_LIVED_BRANCHES, pagesBranch(productionBranch)].filter(Boolean));

  let target = "";
  let cutoff = "";
  if (branch !== undefined) {
    target = pagesBranch(branch);
    if (!target) throw new Error(`"${branch}" is not a branch name Pages could deploy.`);
    if (longLived.has(target)) {
      throw new Error(`"${target}" is a long-lived alias; the sweep trims it, --branch never does.`);
    }
  } else {
    if (!(Number.isFinite(olderThanDays) && olderThanDays > 0)) {
      throw new Error(`The sweep needs a positive number of days (got ${olderThanDays}).`);
    }
    cutoff = new Date(now.getTime() - olderThanDays * DAY_MS).toISOString();
  }

  const sorted = [...deployments].sort(newestFirst);
  const newestId = sorted[0]?.id;
  const open = new Set(openBranches.map(pagesBranch).filter(Boolean));

  // The newest `rollbackKeep` of each long-lived alias.
  const rollback = new Set();
  const seen = new Map();
  for (const deployment of sorted) {
    const name = pagesBranch(deployment.branch);
    if (!longLived.has(name)) continue;
    const count = seen.get(name) || 0;
    if (count < rollbackKeep) rollback.add(deployment.id);
    seen.set(name, count + 1);
  }

  const keepReason = (deployment) => {
    const name = pagesBranch(deployment.branch);
    if (deployment.id === liveId) return "live";
    if (onCustomDomain(deployment)) return "custom domain";
    if (deployment.id === newestId) return "newest in project";
    if (rollback.has(deployment.id)) return "rollback";
    if (name && open.has(name)) return "open PR";
    if (cutoff && deployment.createdOn >= cutoff) return "recent";
    return "";
  };

  return sorted
    .filter((deployment) => !target || pagesBranch(deployment.branch) === target)
    .map((deployment) => {
      const reason = keepReason(deployment);
      return { deployment, action: reason ? "keep" : "delete", reason };
    });
}

/**
 * A plan in numbers: how many go, their dates, the branches they come from
 * (most first), and how many stay for each reason.
 * @param {PlanEntry[]} plan
 */
export function summarise(plan) {
  const going = plan.filter((entry) => entry.action === "delete").map((entry) => entry.deployment);
  const dates = going.map((deployment) => deployment.createdOn).sort();
  const branches = new Map();
  for (const deployment of going) {
    const entry = branches.get(deployment.branch) || {
      branch: deployment.branch,
      count: 0,
      oldest: deployment.createdOn,
      newest: deployment.createdOn,
    };
    entry.count += 1;
    if (deployment.createdOn < entry.oldest) entry.oldest = deployment.createdOn;
    if (deployment.createdOn > entry.newest) entry.newest = deployment.createdOn;
    branches.set(deployment.branch, entry);
  }
  const kept = {};
  for (const entry of plan) if (entry.action === "keep") kept[entry.reason] = (kept[entry.reason] || 0) + 1;
  return {
    total: plan.length,
    deleting: going.length,
    oldest: dates[0] || "",
    newest: dates.at(-1) || "",
    byBranch: [...branches.values()].sort((a, b) => b.count - a.count || a.branch.localeCompare(b.branch)),
    kept,
  };
}
