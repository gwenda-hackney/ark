#!/usr/bin/env node
/**
 * Roll a production Pages deploy back when its smoke test fails (#18). CI:
 *
 *   node scripts/pages-rollback.mjs remember --project gwenda [--url https://gwenda.co.uk]
 *     before the deploy: writes previous-id (and previous-version, the
 *     X-Gwenda-Version that --url serves) to $GITHUB_OUTPUT
 *   node scripts/pages-rollback.mjs rollback --project gwenda --to <previous-id>
 *     after a failed check: puts that deployment back live, notes it in the
 *     job summary
 *
 * Needs CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID.
 */
import { appendFileSync } from "node:fs";
import { liveDeploymentId, rollBack } from "./lib/pages-rollback.mjs";

const [command] = process.argv.slice(2);
const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] || "" : "";
};
const project = arg("--project");
const api = { accountId: process.env.CLOUDFLARE_ACCOUNT_ID, token: process.env.CLOUDFLARE_API_TOKEN };

function output(name, value) {
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
}

function summary(markdown) {
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${markdown}\n`);
}

async function main() {
  if (!project || !["remember", "rollback"].includes(command)) {
    throw new Error("Usage: pages-rollback.mjs remember|rollback --project NAME [--url URL] [--to ID]");
  }
  if (!api.accountId || !api.token) throw new Error("Missing CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_API_TOKEN");

  if (command === "remember") {
    const id = await liveDeploymentId(api, project);
    output("previous-id", id);
    let version = "";
    if (arg("--url")) {
      const res = await fetch(arg("--url"), { method: "HEAD" }).catch(() => null);
      version = res?.headers.get("x-gwenda-version") || "";
      output("previous-version", version);
    }
    console.log(`${project}: live deployment ${id || "(none)"}${version ? `, version ${version}` : ""}`);
    return;
  }

  const to = arg("--to");
  const result = await rollBack(api, project, to);
  const messages = {
    "rolled-back": `Rolled ${project} back to deployment \`${to}\`, the one live before this run.`,
    "already-live": `${project} still serves deployment \`${to}\`; the new one never went live. Nothing to roll back.`,
    "nothing-to-roll-back-to": `${project} had no live deployment before this run. Nothing to roll back to.`,
  };
  console.log(messages[result]);
  summary(`### ⏪ Rollback\n\n${messages[result]}`);
}

try {
  await main();
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  summary(`### ⚠️ Rollback failed\n\n${err instanceof Error ? err.message : err}\n\nRoll back by hand in the Cloudflare dashboard (Pages → ${project} → Deployments).`);
  process.exitCode = 1;
}
