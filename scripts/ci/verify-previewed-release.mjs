/**
 * Ensure release HEAD was previewed by the latest successful Deploy production run.
 *
 * Requires GITHUB_TOKEN (actions:read), GITHUB_REPOSITORY, and RELEASE_SHA.
 */
import { appendFileSync } from "node:fs";

const token = process.env.GITHUB_TOKEN;
const repo = process.env.GITHUB_REPOSITORY;
const releaseSha = process.env.RELEASE_SHA;

if (!token || !repo || !releaseSha) {
  console.error("Missing GITHUB_TOKEN, GITHUB_REPOSITORY, or RELEASE_SHA");
  process.exit(1);
}

const [owner, name] = repo.split("/");
const url = new URL(
  `https://api.github.com/repos/${owner}/${name}/actions/workflows/deploy-production.yml/runs`,
);
url.searchParams.set("branch", "release");
url.searchParams.set("status", "success");
url.searchParams.set("per_page", "1");

const res = await fetch(url, {
  headers: {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  },
});

if (!res.ok) {
  console.error(`GitHub API error ${res.status}: ${await res.text()}`);
  process.exit(1);
}

const data = await res.json();
const latest = data.workflow_runs?.[0];

if (!latest) {
  console.error(
    "No successful production preview found on release. Push to release first.",
  );
  process.exit(1);
}

if (latest.head_sha !== releaseSha) {
  console.error(
    `Release HEAD (${releaseSha.slice(0, 7)}) does not match the last previewed commit (${latest.head_sha.slice(0, 7)}).`,
  );
  console.error(
    "Push to release again to deploy a fresh preview before promoting.",
  );
  process.exit(1);
}

const runUrl = latest.html_url;
console.log(
  `OK release matches last successful preview (${latest.head_sha.slice(0, 7)}) — run ${latest.id}`,
);
console.log(runUrl);

const outputPath = process.env.GITHUB_OUTPUT;
if (outputPath) {
  appendFileSync(outputPath, `preview-run-id=${latest.id}\n`);
  appendFileSync(outputPath, `preview-run-url=${runUrl}\n`);
  appendFileSync(outputPath, `sha=${latest.head_sha}\n`);
}
