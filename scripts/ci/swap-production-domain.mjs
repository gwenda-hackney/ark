/**
 * Blue/green domain swap: detach from live slot, attach to standby slot.
 * On failure, detach standby (if needed) and re-attach the live slot.
 */
import { spawnSync } from "node:child_process";

const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const ZONE_NAME = process.env.ZONE_NAME || "gwenda.co.uk";
const LIVE_PROJECT = process.env.LIVE_PROJECT;
const STANDBY_PROJECT = process.env.STANDBY_PROJECT;
const NEW_ACTIVE_SLOT = process.env.NEW_ACTIVE_SLOT;

const PRODUCTION_DOMAINS = (
  process.env.PRODUCTION_DOMAINS || "gwenda.co.uk,www.gwenda.co.uk"
)
  .split(",")
  .map((domain) => domain.trim())
  .filter(Boolean);

if (
  !ACCOUNT_ID ||
  !API_TOKEN ||
  !LIVE_PROJECT ||
  !STANDBY_PROJECT ||
  !NEW_ACTIVE_SLOT ||
  PRODUCTION_DOMAINS.length === 0
) {
  console.error(
    "Missing LIVE_PROJECT, STANDBY_PROJECT, NEW_ACTIVE_SLOT, PRODUCTION_DOMAINS, or Cloudflare credentials",
  );
  process.exit(1);
}

function run(script, env) {
  return spawnSync("node", [script], {
    env: { ...process.env, ...env },
    stdio: "inherit",
  });
}

function detach(project, domain) {
  return run("scripts/ci/detach-pages-domain.mjs", {
    PAGES_PROJECT_NAME: project,
    CUSTOM_DOMAIN: domain,
  });
}

function ensureDomain(project, domain) {
  return run("scripts/ensure-pages-domain.mjs", {
    PAGES_PROJECT_NAME: project,
    CUSTOM_DOMAIN: domain,
    ZONE_NAME,
  });
}

function swapDomains(fromProject, toProject) {
  for (const domain of PRODUCTION_DOMAINS) {
    const detached = detach(fromProject, domain);
    if (detached.status !== 0) return detached.status || 1;

    const attached = ensureDomain(toProject, domain);
    if (attached.status !== 0) return attached.status || 1;
  }
  return 0;
}

function rollbackToLive() {
  console.error(
    `Swap failed — rolling back production domains to ${LIVE_PROJECT}.`,
  );

  for (const domain of PRODUCTION_DOMAINS) {
    detach(STANDBY_PROJECT, domain);
    const attached = ensureDomain(LIVE_PROJECT, domain);
    if (attached.status !== 0) {
      console.error(
        "Rollback failed — production domains may need manual recovery in Cloudflare.",
      );
      return attached.status || 1;
    }
  }

  console.error(
    `Rollback complete: production domains restored on ${LIVE_PROJECT}. Swap aborted.`,
  );
  return 0;
}

if (LIVE_PROJECT !== STANDBY_PROJECT) {
  const swapped = swapDomains(LIVE_PROJECT, STANDBY_PROJECT);
  if (swapped !== 0) {
    const rollbackStatus = rollbackToLive();
    process.exit(rollbackStatus || swapped || 1);
  }
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
  `Production domains (${PRODUCTION_DOMAINS.join(", ")}) now on ${STANDBY_PROJECT} (${NEW_ACTIVE_SLOT} slot).`,
);
