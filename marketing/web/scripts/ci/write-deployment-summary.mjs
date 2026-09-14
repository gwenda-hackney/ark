/**
 * Write a GitHub Actions step summary from DEPLOY_SUMMARY_JSON env var.
 */
import { appendFileSync } from "node:fs";

const raw = process.env.DEPLOY_SUMMARY_JSON;
if (!raw) {
  console.error("Missing DEPLOY_SUMMARY_JSON");
  process.exit(1);
}

const data = JSON.parse(raw);
const lines = [`## ${data.title}`, "", "| | |", "|---|---|"];

for (const [label, value] of data.rows) {
  lines.push(`| **${label}** | ${value} |`);
}

const summaryPath = process.env.GITHUB_STEP_SUMMARY;
if (summaryPath) {
  appendFileSync(summaryPath, `${lines.join("\n")}\n`);
}
