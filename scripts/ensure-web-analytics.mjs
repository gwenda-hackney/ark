/**
 * Ensure Cloudflare Web Analytics uses zone auto-inject without mixing staging and production.
 *
 * Same zone (gwenda.co.uk) but staging runs on a subdomain — zone-wide auto_install would
 * otherwise count staging traffic in production. We keep separate Web Analytics sites and
 * host rules so metrics stay isolated.
 *
 * Env:
 *   SITE_HOST     — gwenda.co.uk (production) or staging.gwenda.co.uk (staging)
 *   ZONE_NAME     — DNS zone (default: gwenda.co.uk)
 *   STAGING_HOST  — excluded from production site (default: staging.gwenda.co.uk)
 */

import { fileURLToPath } from "node:url";

const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const HOST = process.env.SITE_HOST;
const ZONE_NAME = process.env.ZONE_NAME || "gwenda.co.uk";
const STAGING_HOST = process.env.STAGING_HOST || "staging.gwenda.co.uk";
const PRODUCTION_HOSTS = ["gwenda.co.uk", "www.gwenda.co.uk"];

if (!ACCOUNT_ID || !API_TOKEN || !HOST) {
  console.error(
    "Missing Cloudflare account/token or SITE_HOST for Web Analytics setup.",
  );
  process.exit(1);
}

const isStagingHost = HOST === STAGING_HOST || HOST.startsWith("staging.");

async function cf(path, { method = "GET", body } = {}) {
  const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!data.success) {
    const msg = data.errors?.map((e) => e.message).join("; ") || res.statusText;
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  return data.result;
}

function findSiteForHost(sites, host) {
  return (
    sites?.find((s) => s.rules?.some((r) => r.host === host)) ??
    sites?.find((s) => s.ruleset?.zone_name === host && host === ZONE_NAME) ??
    null
  );
}

function siteNeedsAutoInstall(site) {
  return site.auto_install !== true || site.ruleset?.enabled !== true;
}

function ruleMatches(rule, host, inclusive) {
  return rule.host === host && rule.inclusive === inclusive && !rule.is_paused;
}

async function listRules(rulesetId) {
  const result = await cf(`/accounts/${ACCOUNT_ID}/rum/v2/${rulesetId}/rules`);
  return result?.rules ?? [];
}

async function ensureHostRule(rulesetId, { host, inclusive }) {
  const rules = await listRules(rulesetId);
  const existing = rules.find((rule) => ruleMatches(rule, host, inclusive));
  const body = { host, inclusive, paths: ["*"], is_paused: false };

  if (existing?.id) {
    await cf(`/accounts/${ACCOUNT_ID}/rum/v2/${rulesetId}/rule/${existing.id}`, {
      method: "PUT",
      body,
    });
    console.log(
      `Updated Web Analytics rule (${inclusive ? "include" : "exclude"} ${host}).`,
    );
    return;
  }

  await cf(`/accounts/${ACCOUNT_ID}/rum/v2/${rulesetId}/rule`, {
    method: "POST",
    body,
  });
  console.log(
    `Created Web Analytics rule (${inclusive ? "include" : "exclude"} ${host}).`,
  );
}

async function ensureHostRules(rulesetId, hosts, inclusive) {
  for (const host of hosts) {
    await ensureHostRule(rulesetId, { host, inclusive });
  }
}

async function getZone() {
  const zones = await cf(
    `/zones?name=${ZONE_NAME}&account.id=${ACCOUNT_ID}`,
  );
  return zones?.[0] ?? null;
}

async function ensureSite(host) {
  const sites = await cf(`/accounts/${ACCOUNT_ID}/rum/site_info/list`);
  let site = findSiteForHost(sites, host);

  if (!site) {
    const zone = await getZone();
    const body = zone
      ? { host, zone_tag: zone.id, auto_install: true, enabled: true }
      : { host, auto_install: true, enabled: true };

    site = await cf(`/accounts/${ACCOUNT_ID}/rum/site_info`, {
      method: "POST",
      body,
    });
    console.log(`Created Web Analytics site for ${host}.`);
  }

  const siteTag = site.site_tag;
  if (!siteTag) {
    throw new Error(`Could not resolve Web Analytics site_tag for ${host}.`);
  }

  if (siteNeedsAutoInstall(site)) {
    const zoneTag = site.ruleset?.zone_tag;
    const zone = zoneTag ? { id: zoneTag } : await getZone();

    await cf(`/accounts/${ACCOUNT_ID}/rum/site_info/${siteTag}`, {
      method: "PUT",
      body: {
        auto_install: true,
        enabled: true,
        host,
        ...(zone ? { zone_tag: zone.id ?? zoneTag } : {}),
      },
    });
    console.log(`Enabled zone auto-inject for ${host}.`);
  }

  const refreshed = await cf(`/accounts/${ACCOUNT_ID}/rum/site_info/${siteTag}`);
  const rulesetId = refreshed.ruleset?.id ?? site.ruleset?.id;
  if (!rulesetId) {
    throw new Error(`No Web Analytics ruleset for ${host}.`);
  }

  return { siteTag, rulesetId };
}

async function configureProductionSite(rulesetId) {
  await ensureHostRule(rulesetId, {
    host: STAGING_HOST,
    inclusive: false,
  });
  console.log(
    `Production Web Analytics excludes ${STAGING_HOST} (staging traffic stays out of prod metrics).`,
  );
}

async function configureStagingSite(rulesetId) {
  await ensureHostRule(rulesetId, {
    host: STAGING_HOST,
    inclusive: true,
  });
  await ensureHostRules(rulesetId, PRODUCTION_HOSTS, false);
  console.log(
    `Staging Web Analytics tracks ${STAGING_HOST} only (separate from production).`,
  );
}

async function main() {
  try {
    const { rulesetId } = await ensureSite(HOST);

    if (isStagingHost) {
      await configureStagingSite(rulesetId);
    } else {
      await configureProductionSite(rulesetId);
    }

    console.log(`Web Analytics configured for ${HOST}.`);
  } catch (err) {
    console.warn(
      `Could not configure Web Analytics for ${HOST} (${err.message}).\n` +
        `Set host rules in Cloudflare dashboard → Web Analytics, or grant Analytics Edit on ` +
        `CLOUDFLARE_API_TOKEN.\n` +
        (isStagingHost
          ? `Staging site: include ${STAGING_HOST}; exclude ${PRODUCTION_HOSTS.join(", ")}.\n`
          : `Production site: exclude ${STAGING_HOST} from zone auto-inject.\n`),
    );
    process.exit(0);
  }
}

const isDirectRun = process.argv[1] === fileURLToPath(import.meta.url);

if (isDirectRun) {
  await main();
}
