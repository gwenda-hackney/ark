#!/usr/bin/env node
/**
 * Put this branch's preview link in its PR's previews comment (#60). CI only:
 *
 *   node scripts/pr-preview-comment.mjs --app web --url https://x.gwenda-web-dev.pages.dev
 *
 * Needs GITHUB_TOKEN (pull-requests: write), GITHUB_REPOSITORY, GITHUB_REF_NAME
 * and GITHUB_SHA. A branch without an open PR is skipped. A failure only
 * warns: the preview itself worked.
 */
import { upsertPreviewComment } from "./lib/pr-preview-comment.mjs";

const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] || "" : "";
};

try {
  const number = await upsertPreviewComment({
    repo: process.env.GITHUB_REPOSITORY,
    token: process.env.GITHUB_TOKEN,
    branch: process.env.GITHUB_REF_NAME,
    sha: process.env.GITHUB_SHA,
    app: arg("--app"),
    url: arg("--url"),
  });
  console.log(number ? `Updated the previews comment on #${number}.` : "No open PR for this branch; no comment.");
} catch (err) {
  console.log(`::warning::Couldn't update the PR previews comment: ${err instanceof Error ? err.message : err}`);
}
