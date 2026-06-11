/**
 * Resolve blue/green production slot for deploy.
 * Reads PRODUCTION_ACTIVE_SLOT (blue|green), defaults to blue.
 */
import { appendFileSync } from "node:fs";

const active = (process.env.PRODUCTION_ACTIVE_SLOT || "blue").toLowerCase();
if (active !== "blue" && active !== "green") {
  console.error(`Invalid PRODUCTION_ACTIVE_SLOT: ${active}`);
  process.exit(1);
}

const standby = active === "blue" ? "green" : "blue";
const liveProject = `gwenda-${active}`;
const deployProject = `gwenda-${standby}`;
const deployUrl = `https://${deployProject}.pages.dev`;

console.log(`Active slot: ${active} (${liveProject})`);
console.log(`Deploy target: ${standby} (${deployProject})`);

const outputPath = process.env.GITHUB_OUTPUT;
if (outputPath) {
  appendFileSync(outputPath, `active_slot=${active}\n`);
  appendFileSync(outputPath, `standby_slot=${standby}\n`);
  appendFileSync(outputPath, `live_project=${liveProject}\n`);
  appendFileSync(outputPath, `deploy_project=${deployProject}\n`);
  appendFileSync(outputPath, `deploy_url=${deployUrl}\n`);
} else {
  console.log(
    JSON.stringify({
      active_slot: active,
      standby_slot: standby,
      live_project: liveProject,
      deploy_project: deployProject,
      deploy_url: deployUrl,
    }),
  );
}
