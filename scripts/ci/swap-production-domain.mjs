/**
 * Blue/green domain swap: detach from live slot, attach to standby slot.
 * On failure, detach standby (if needed) and re-attach the live slot.
 */
import { spawnSync } from "node:child_process";

const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const DOMAIN = process.env.CUSTOM_DOMAIN || "gwenda.co.uk";
const ZONE_NAME = process.env.ZONE_NAME || DOMAIN;
const LIVE_PROJECT = process.env.LIVE_PROJECT;
const STANDBY_PROJECT = process.env.STANDBY_PROJECT;
const NEW_ACTIVE_SLOT = process.env.NEW_ACTIVE_SLOT;

if (
  !ACCOUNT_ID ||
  !API_TOKEN ||
  !LIVE_PROJECT ||
  !STANDBY_PROJECT ||
  !NEW_ACTIVE_SLOT
) {
  console.error(
    "Missing LIVE_PROJECT, STANDBY_PROJECT, NEW_ACTIVE_SLOT, or Cloudflare credentials",
  );
  process.exit(1);
}

function run(script, env) {
  return spawnSync("node", [script], {
    env: { ...process.env, ...env },
    stdio: "inherit",
  });
}

function detach(project) {
  return run("scripts/ci/detach-pages-domain.mjs", {
    PAGES_PROJECT_NAME: project,
    CUSTOM_DOMAIN: DOMAIN,
  });
}

function ensureDomain(project) {
  return run("scripts/ensure-pages-domain.mjs", {
    PAGES_PROJECT_NAME: project,
    CUSTOM_DOMAIN: DOMAIN,
    ZONE_NAME,
  });
}

function rollbackToLive() {
  console.error(
    `Swap failed — rolling back custom domain to live slot (${LIVE_PROJECT}).`,
  );
  detach(STANDBY_PROJECT);
  const reattach = ensureDomain(LIVE_PROJECT);
  if (reattach.status === 0) {
    console.error(
      `Rollback complete: ${DOMAIN} restored on ${LIVE_PROJECT}. Swap aborted.`,
    );
    return 0;
  }

  console.error(
    `Rollback failed — ${DOMAIN} may need manual recovery in Cloudflare.`,
  );
  return reattach.status || 1;
}

if (LIVE_PROJECT !== STANDBY_PROJECT) {
  const detached = detach(LIVE_PROJECT);
  if (detached.status !== 0) process.exit(detached.status || 1);
}

const attached = ensureDomain(STANDBY_PROJECT);
if (attached.status !== 0) {
  const rollbackStatus = rollbackToLive();
  process.exit(rollbackStatus || attached.status || 1);
}

const repo = process.env.GITHUB_REPOSITORY;
const token = process.env.GITHUB_TOKEN;

if (repo && token) {
  const [owner, name] = repo.split("/");
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${name}/actions/variables/PRODUCTION_ACTIVE_SLOT`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({
        name: "PRODUCTION_ACTIVE_SLOT",
        value: NEW_ACTIVE_SLOT,
      }),
    },
  );
  if (res.ok) {
    console.log(`Updated PRODUCTION_ACTIVE_SLOT=${NEW_ACTIVE_SLOT}.`);
  } else {
    const patchFailed = await res.text();
    const createRes = await fetch(
      `https://api.github.com/repos/${owner}/${name}/actions/variables`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        body: JSON.stringify({
          name: "PRODUCTION_ACTIVE_SLOT",
          value: NEW_ACTIVE_SLOT,
        }),
      },
    );
    if (createRes.ok) {
      console.log(`Created PRODUCTION_ACTIVE_SLOT=${NEW_ACTIVE_SLOT}.`);
    } else {
      console.warn(
        `Could not update GitHub variable PRODUCTION_ACTIVE_SLOT (${res.status}). ` +
          `Set it manually to "${NEW_ACTIVE_SLOT}". ${patchFailed}`,
      );
    }
  }
} else {
  console.warn(
    `Set repository variable PRODUCTION_ACTIVE_SLOT=${NEW_ACTIVE_SLOT} manually.`,
  );
}

console.log(
  `Production domain ${DOMAIN} now on ${STANDBY_PROJECT} (${NEW_ACTIVE_SLOT} slot).`,
);
