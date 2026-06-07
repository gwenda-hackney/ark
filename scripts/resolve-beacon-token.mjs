/**
 * Resolve the Cloudflare Web Analytics beacon token for gwenda.co.uk.
 * Used in CI before build; falls back to PUBLIC_CF_BEACON_TOKEN if set.
 *
 * Prints the token to stdout (one line). Requires Analytics API access to
 * auto-provision; otherwise set PUBLIC_CF_BEACON_TOKEN in GitHub vars or .env.
 */

import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const HOST = process.env.SITE_HOST || "gwenda.co.uk";

function getApiToken() {
  if (process.env.CLOUDFLARE_API_TOKEN) return process.env.CLOUDFLARE_API_TOKEN;

  const configPath = join(homedir(), ".config/.wrangler/config/default.toml");
  if (!existsSync(configPath)) return null;
  const config = readFileSync(configPath, "utf8");
  const match = config.match(/^oauth_token = "(.+)"$/m);
  return match?.[1] ?? null;
}

async function cf(path, token, { method = "GET", body } = {}) {
  const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
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

function tokenFromSite(site) {
  const match = site.snippet?.match(/data-cf-beacon='(\{[^']+\})'/);
  if (match) {
    try {
      const parsed = JSON.parse(match[1].replace(/\\"/g, '"'));
      if (parsed.token) return parsed.token;
    } catch {
      /* fall through */
    }
  }
  return site.site_token ?? null;
}

async function resolveFromApi(accountId, apiToken) {
  let sites;
  try {
    sites = await cf(`/accounts/${accountId}/rum/site_info/list`, apiToken);
  } catch (err) {
    if (err.status === 403) return null;
    throw err;
  }

  let site = sites?.find((s) =>
    s.rules?.some((r) => r.host === HOST || r.zone_name === HOST),
  );
  if (!site && sites?.length === 1) site = sites[0];
  if (!site) {
    site = sites?.find((s) => s.ruleset?.zone_name === HOST);
  }

  if (!site) {
    const zones = await cf(
      `/zones?name=${HOST}&account.id=${accountId}`,
      apiToken,
    );
    const zone = zones?.[0];

    // Zone may still be on another account until transfer — host-only works (manual beacon).
    const body = zone
      ? { host: HOST, zone_tag: zone.id, auto_install: false }
      : { host: HOST, auto_install: false };

    try {
      site = await cf(`/accounts/${accountId}/rum/site_info`, apiToken, {
        method: "POST",
        body,
      });
    } catch (err) {
      if (err.status === 403) return null;
      throw err;
    }
  }

  return tokenFromSite(site);
}

const fallback = process.env.PUBLIC_CF_BEACON_TOKEN?.trim();
const apiToken = getApiToken();

let token = fallback;
if (apiToken && ACCOUNT_ID) {
  try {
    const resolved = await resolveFromApi(ACCOUNT_ID, apiToken);
    if (resolved) token = resolved;
  } catch (err) {
    console.error(`resolve-beacon-token: API error — ${err.message}`);
  }
}

if (!token) {
  console.error(
    "No beacon token. Set PUBLIC_CF_BEACON_TOKEN or grant Analytics Edit on CLOUDFLARE_API_TOKEN.",
  );
  process.exit(1);
}

process.stdout.write(token);
