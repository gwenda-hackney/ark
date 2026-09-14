/**
 * Ensure a content preview run is eligible to promote to live.
 *
 * Requires GITHUB_TOKEN, GITHUB_REPOSITORY, and PREVIEW_RUN_ID.
 * Writes preview-run-id, preview-run-url, and sha to GITHUB_OUTPUT.
 */
import { appendFileSync } from "node:fs";

const token = process.env.GITHUB_TOKEN;
const repo = process.env.GITHUB_REPOSITORY;
const previewRunId = process.env.PREVIEW_RUN_ID?.trim();

if (!token || !repo || !previewRunId) {
  console.error("Missing GITHUB_TOKEN, GITHUB_REPOSITORY, or PREVIEW_RUN_ID");
  process.exit(1);
}

const runId = Number(previewRunId);
if (!Number.isFinite(runId) || runId <= 0) {
  console.error(`Invalid PREVIEW_RUN_ID: ${previewRunId}`);
  process.exit(1);
}

const [owner, name] = repo.split("/");
const res = await fetch(
  `https://api.github.com/repos/${owner}/${name}/actions/runs/${runId}`,
  {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "gwenda-verify-content-preview",
    },
  },
);

if (!res.ok) {
  console.error(`GitHub API error ${res.status}: ${await res.text()}`);
  process.exit(1);
}

const run = await res.json();
const path = typeof run.path === "string" ? run.path : "";
const title = String(run.display_title || run.name || "");
const okWorkflow =
  (path.endsWith("web.yml") || path.includes("/web.yml")) &&
  (title === "production-content" ||
    title.includes("production-content") ||
    title === "content-deploy-production" ||
    title.includes("content-deploy-production"));

if (!okWorkflow) {
  console.error(
    `Run ${runId} is not a production content preview (path: ${path || "unknown"}, name: ${title || "unknown"}).`,
  );
  process.exit(1);
}

if (run.status !== "completed" || run.conclusion !== "success") {
  console.error(
    `Content preview run ${runId} is not a successful completed run (status=${run.status}, conclusion=${run.conclusion}).`,
  );
  process.exit(1);
}

const runUrl = run.html_url;
const sha = run.head_sha;
console.log(`OK content preview run ${runId} (${String(sha).slice(0, 7)})`);
console.log(runUrl);

const outputPath = process.env.GITHUB_OUTPUT;
if (outputPath) {
  appendFileSync(outputPath, `preview-run-id=${runId}\n`);
  appendFileSync(outputPath, `preview-run-url=${runUrl}\n`);
  appendFileSync(outputPath, `sha=${sha}\n`);
}
