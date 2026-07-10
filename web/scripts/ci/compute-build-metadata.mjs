/**
 * Compute build metadata for CI. Appends version/time/sha/ref to GITHUB_OUTPUT.
 */
import { appendFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const time =
  process.env.PUBLIC_BUILD_TIME ||
  process.env.GITHUB_EVENT_HEAD_COMMIT_TIMESTAMP ||
  new Date().toISOString();
/** Promote passes BUILD_COMMIT_SHA — GITHUB_SHA cannot be overridden in Actions. */
const sha = process.env.BUILD_COMMIT_SHA || process.env.GITHUB_SHA || "";
const ref = process.env.GITHUB_REF_NAME || "";

process.env.PUBLIC_BUILD_TIME = time;
process.env.PUBLIC_BUILD_SHA = sha;

const result = spawnSync(
  "node",
  ["scripts/compute-build-version.mjs", "--export"],
  {
    env: process.env,
    encoding: "utf8",
  },
);
const version = (result.stdout || "").trim();

if (!version) {
  console.error("Could not compute build version.");
  process.exit(1);
}

const outputPath = process.env.GITHUB_OUTPUT;
if (outputPath) {
  appendFileSync(outputPath, `time=${time}\n`);
  appendFileSync(outputPath, `version=${version}\n`);
  appendFileSync(outputPath, `sha=${sha}\n`);
  appendFileSync(outputPath, `ref=${ref}\n`);
} else {
  console.log(JSON.stringify({ time, version, sha, ref }));
}
