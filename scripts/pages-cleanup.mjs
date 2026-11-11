#!/usr/bin/env node
/**
 * Delete old Cloudflare Pages deployments, so projects stay small enough for
 * the dashboard to manage (pages-delete-project.mjs exists because they
 * weren't). Says what it would delete; --apply deletes.
 *
 *   --branch NAME               a closed PR's branch: all its deployments
 *   --sweep [--older-than 30]   everything older than that many days
 *   --env dev|production        the projects to clean (dev by default)
 *
 *   node scripts/with-env.mjs node scripts/pages-cleanup.mjs --branch perf/240-logo-first
 *   node scripts/with-env.mjs node scripts/pages-cleanup.mjs --sweep --older-than 30
 *   node scripts/with-production-cloudflare.mjs node scripts/pages-cleanup.mjs --env production --sweep --older-than 30
 *
 * What always stays (the live deployment, each project's newest, the newest
 * few of main/release/preview for rollback, open PRs' branches, anything on a
 * custom domain) is decided in scripts/lib/pages-cleanup.mjs.
 * CI: .github/workflows/pages-cleanup.yml.
 *
 * Needs CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID (Pages · Edit) for the
 * env's account, and gh (GH_TOKEN in CI) to list open PRs.
 */
import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { deleteDeployment, getProject, listDeployments } from "./lib/pages-api.mjs";
import { planCleanup, slimDeployment, summarise } from "./lib/pages-cleanup.mjs";

/** The Pages projects the workflows deploy to, by Cloudflare account. */
const PROJECTS = {
  // web.yml (dev website and branch previews), apps.yml (ops and brand previews)
  dev: ["gwenda-web-dev", "gwenda-ops-dev", "gwenda-brand-dev"],
  // web-promote.yml and web.yml's preview (gwenda), apps.yml (ops, brand)
  production: ["gwenda", "gwenda-ops", "gwenda-brand"],
};

const USAGE =
  "Usage: pages-cleanup.mjs (--branch NAME | --sweep [--older-than DAYS]) [--env dev|production] [--apply]";

function parseArgs(argv) {
  const out = { branch: undefined, sweep: false, olderThan: 30, env: "dev", apply: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const value = () => {
      const next = argv[(i += 1)];
      if (next === undefined || next.startsWith("--")) throw new Error(`${arg} needs a value. ${USAGE}`);
      return next;
    };
    if (arg === "--branch") out.branch = value();
    else if (arg === "--sweep") out.sweep = true;
    else if (arg === "--older-than") out.olderThan = Number(value());
    else if (arg === "--env") out.env = value();
    else if (arg === "--apply") out.apply = true;
    else throw new Error(`Unknown argument ${arg}. ${USAGE}`);
  }
  if (out.sweep === (out.branch !== undefined)) throw new Error(`Pick one of --branch and --sweep. ${USAGE}`);
  if (!PROJECTS[out.env]) throw new Error(`--env is dev or production (got ${out.env}).`);
  return out;
}

/** Head branches of the repo's open PRs. Fails rather than guess: they protect deployments. */
function openPrBranches() {
  const args = ["pr", "list", "--state", "open", "--limit", "1000", "--json", "headRefName"];
  if (process.env.GITHUB_REPOSITORY) args.push("--repo", process.env.GITHUB_REPOSITORY);
  const prs = JSON.parse(execFileSync("gh", args, { encoding: "utf8" }));
  return prs.map((pr) => pr.headRefName);
}

/** Branches listed per project; the rest are counted. */
const BRANCH_LINES = 12;

const day = (iso) => (iso ? iso.slice(0, 10) : "-");
const range = (from, to) => (day(from) === day(to) ? day(from) : `${day(from)}..${day(to)}`);

function summary(markdown) {
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${markdown}\n`);
}

async function cleanProject(api, project, opts, openBranches) {
  const info = await getProject(api, project);
  const raw = await listDeployments(api, project);
  const plan = planCleanup({
    deployments: raw.map(slimDeployment),
    liveId: info.canonical_deployment?.id || "",
    productionBranch: info.production_branch || "",
    openBranches,
    now: new Date(),
    ...(opts.sweep ? { olderThanDays: opts.olderThan } : { branch: opts.branch }),
  });
  const sum = summarise(plan);
  const live = info.canonical_deployment;
  console.log(
    `\n${project}: ${raw.length} deployments; live ${live ? `${live.short_id} (${live.deployment_trigger?.metadata?.branch}, ${day(live.created_on)})` : "none"}`,
  );
  if (!opts.sweep && !plan.length) {
    console.log(`  no deployments of ${opts.branch}`);
    return { project, sum, deleted: 0, failed: 0 };
  }
  console.log(
    `  ${opts.apply ? "deleting" : "would delete"} ${sum.deleting}${sum.deleting ? `, made ${range(sum.oldest, sum.newest)}` : ""}`,
  );
  for (const entry of sum.byBranch.slice(0, BRANCH_LINES)) {
    console.log(`    ${entry.branch.padEnd(48)} ${String(entry.count).padStart(4)}  ${range(entry.oldest, entry.newest)}`);
  }
  const rest = sum.byBranch.slice(BRANCH_LINES);
  if (rest.length) {
    const count = rest.reduce((total, entry) => total + entry.count, 0);
    console.log(`    … ${rest.length} more branches, ${count} deployments`);
  }
  const kept = Object.entries(sum.kept)
    .map(([reason, count]) => `${count} ${reason}`)
    .join(", ");
  console.log(`  keeps ${sum.total - sum.deleting}${kept ? `: ${kept}` : ""}`);

  if (!opts.apply) return { project, sum, deleted: 0, failed: 0 };
  let deleted = 0;
  let gone = 0;
  const failures = [];
  for (const { deployment, action } of plan) {
    if (action !== "delete") continue;
    try {
      await deleteDeployment(api, project, deployment.id);
      deleted += 1;
    } catch (err) {
      // Another run (a PR close during the sweep) got there first.
      if (err.status === 404) gone += 1;
      else if (err.status === 401 || err.status === 403) {
        throw new Error(`${err.message}\nThe token can't delete deployments in ${project}: it needs Pages · Edit.`);
      } else failures.push(err.message);
    }
    if ((deleted + gone + failures.length) % 25 === 0) console.log(`  ${deleted}/${sum.deleting} deleted`);
  }
  console.log(`  deleted ${deleted}${gone ? `, ${gone} already gone` : ""}${failures.length ? `, ${failures.length} failed` : ""}`);
  for (const message of failures.slice(0, 5)) console.error(`    ${message}`);
  return { project, sum, deleted, failed: failures.length };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const api = {
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID?.trim(),
    token: process.env.CLOUDFLARE_API_TOKEN?.trim(),
  };
  if (!api.accountId || !api.token) throw new Error("Missing CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_API_TOKEN");

  const openBranches = openPrBranches();
  console.log(
    opts.sweep
      ? `Sweep of ${opts.env}: deployments older than ${opts.olderThan} days. ${openBranches.length} open PR branches kept.`
      : `Branch ${opts.branch} on ${opts.env}. ${openBranches.length} open PR branches kept.`,
  );

  const results = [];
  for (const project of PROJECTS[opts.env]) results.push(await cleanProject(api, project, opts, openBranches));

  const total = results.reduce((sum, result) => sum + result.sum.deleting, 0);
  const failed = results.reduce((sum, result) => sum + result.failed, 0);
  console.log(
    opts.apply
      ? `\nDeleted ${results.reduce((sum, result) => sum + result.deleted, 0)} of ${total} deployment(s).`
      : `\nWould delete ${total} deployment(s). Run again with --apply.`,
  );
  summary(
    [
      `### Pages cleanup (${opts.sweep ? `older than ${opts.olderThan} days` : `branch \`${opts.branch}\``}, ${opts.env})`,
      "",
      "| Project | Deployments | Deleted | Kept |",
      "|---|---|---|---|",
      ...results.map(
        ({ project, sum, deleted }) =>
          `| ${project} | ${sum.total} | ${opts.apply ? deleted : `${sum.deleting} (dry run)`} | ${sum.total - sum.deleting} |`,
      ),
    ].join("\n"),
  );
  if (failed) throw new Error(`${failed} deletion(s) failed; see above.`);
}

try {
  await main();
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
}
