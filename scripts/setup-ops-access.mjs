#!/usr/bin/env node
/**
 * Upsert Cloudflare Access (Google) in front of gwenda-ops.pages.dev.
 *
 * Usage (from repo root):
 *   npm run setup:ops-access
 *
 * Reads from repo-root .env:
 *   CLOUDFLARE_DEV_API_TOKEN (local DEV: Pages, Wrangler, Access setup)
 *   CLOUDFLARE_ACCOUNT_ID
 *   CF_ACCESS_GOOGLE_CLIENT_ID, CF_ACCESS_GOOGLE_CLIENT_SECRET  (Google OAuth web client)
 *
 * Membership is the Baserow Users table, not an Access email policy.
 * The Google client secret stays in Access. It is not a Pages secret.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveCloudflareDevToken } from "./lib/cloudflare-tokens.mjs";
import {
  ACCESS_ENABLE_HINT,
  ACCESS_WRITE_HINT,
  OPS_ACCESS_APP_NAME,
  OPS_ACCESS_DOMAIN,
  OPS_ACCESS_IDP_NAME,
  OPS_ACCESS_PREVIEW_APP_NAME,
  OPS_ACCESS_PREVIEW_DOMAIN,
  accessAppBody,
  allowAuthenticatedPolicyBody,
  findAppForDomain,
  findNamed,
  googleCallbackUrl,
  googleIdpBody,
  googleOriginUrl,
} from "./lib/ops-access.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ENV_PATH = resolve(ROOT, ".env");

function loadDotEnv() {
  if (!existsSync(ENV_PATH)) {
    throw new Error(`Missing ${ENV_PATH} — add CLOUDFLARE_DEV_API_TOKEN first.`);
  }
  for (const line of readFileSync(ENV_PATH, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function permissionError(status, message) {
  const parts = [message];
  if (/not_enabled/i.test(message)) parts.push(ACCESS_ENABLE_HINT);
  if (status === 403 || status === 401 || /permission|authorization|access/i.test(message)) {
    parts.push(ACCESS_WRITE_HINT);
  }
  return [...new Set(parts)].join("\n\n");
}

async function cf(accountId, token, path, { method = "GET", body } = {}) {
  const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!data.success) {
    const msg =
      data.errors?.map((e) => e.message).join("; ") ||
      res.statusText ||
      "Cloudflare API error";
    const err = new Error(permissionError(res.status, msg));
    err.status = res.status;
    err.errors = data.errors;
    throw err;
  }
  return data;
}

async function cfList(accountId, token, path) {
  const all = [];
  let page = 1;
  for (;;) {
    const sep = path.includes("?") ? "&" : "?";
    const data = await cf(
      accountId,
      token,
      `${path}${sep}page=${page}&per_page=100`,
    );
    const batch = data.result || [];
    all.push(...batch);
    const info = data.result_info;
    const perPage = info?.per_page || 100;
    const total = info?.total_count;
    if (!info || typeof total !== "number") {
      if (batch.length < perPage) break;
    } else if (page * perPage >= total) {
      break;
    }
    page += 1;
    if (page > 50) break;
  }
  return all;
}

async function ensureOrganization(accountId, token) {
  try {
    const data = await cf(
      accountId,
      token,
      `/accounts/${accountId}/access/organizations`,
    );
    return data.result;
  } catch (error) {
    if (error.status === 403) {
      try {
        await cf(
          accountId,
          token,
          `/accounts/${accountId}/access/apps?per_page=1`,
        );
      } catch (probe) {
        throw probe.status ? probe : error;
      }
    }
    if (error.status !== 404) throw error;
  }

  const suggested =
    process.env.CF_ACCESS_TEAM_DOMAIN?.trim() || "gwendahackney.cloudflareaccess.com";
  const created = await cf(
    accountId,
    token,
    `/accounts/${accountId}/access/organizations`,
    {
      method: "POST",
      body: {
        name: "Gwenda",
        auth_domain: suggested.replace(/^https?:\/\//, "").replace(/\/$/, ""),
      },
    },
  );
  console.log(`Created Zero Trust team ${created.result?.auth_domain}.`);
  return created.result;
}

async function ensureGoogleIdp(accountId, token, { clientId, clientSecret }) {
  const idps = await cfList(
    accountId,
    token,
    `/accounts/${accountId}/access/identity_providers`,
  );
  const existing =
    findNamed(idps, OPS_ACCESS_IDP_NAME) ||
    idps.find((idp) => idp?.type === "google") ||
    null;

  if (!clientId || !clientSecret) return existing;

  const body = googleIdpBody({ clientId, clientSecret });
  if (existing?.id) {
    const updated = await cf(
      accountId,
      token,
      `/accounts/${accountId}/access/identity_providers/${existing.id}`,
      { method: "PUT", body },
    );
    console.log(`Updated Google identity provider (${existing.id}).`);
    return updated.result;
  }

  const created = await cf(
    accountId,
    token,
    `/accounts/${accountId}/access/identity_providers`,
    { method: "POST", body },
  );
  console.log(`Created Google identity provider (${created.result?.id}).`);
  return created.result;
}

async function upsertApp(accountId, token, apps, { name, domain, googleIdpId }) {
  const existing =
    findNamed(apps, name) || findAppForDomain(apps, domain) || null;
  const body = accessAppBody({ name, domain, googleIdpId });
  if (existing?.id) {
    const updated = await cf(
      accountId,
      token,
      `/accounts/${accountId}/access/apps/${existing.id}`,
      { method: "PUT", body },
    );
    console.log(`Updated Access app "${name}" (${domain}).`);
    return updated.result;
  }
  const created = await cf(accountId, token, `/accounts/${accountId}/access/apps`, {
    method: "POST",
    body,
  });
  console.log(`Created Access app "${name}" (${domain}).`);
  return created.result;
}

async function upsertAllowPolicy(accountId, token, app) {
  const policies = await cfList(
    accountId,
    token,
    `/accounts/${accountId}/access/apps/${app.id}/policies`,
  );
  const existing =
    findNamed(policies, "Allow Google") ||
    findNamed(policies, "Allow ops emails") ||
    policies.find((p) => p?.decision === "allow") ||
    null;
  const body = allowAuthenticatedPolicyBody();
  if (existing?.id) {
    await cf(
      accountId,
      token,
      `/accounts/${accountId}/access/apps/${app.id}/policies/${existing.id}`,
      { method: "PUT", body },
    );
    console.log(`Updated allow policy on "${app.name}".`);
    return;
  }
  await cf(
    accountId,
    token,
    `/accounts/${accountId}/access/apps/${app.id}/policies`,
    { method: "POST", body },
  );
  console.log(`Created allow policy on "${app.name}".`);
}

function printGoogleSetup(org) {
  const authDomain = org?.auth_domain || "<team>.cloudflareaccess.com";
  console.log(`
Google Cloud OAuth client (Web application)
  Authorized JavaScript origins: ${googleOriginUrl(authDomain)}
  Authorized redirect URI:       ${googleCallbackUrl(authDomain)}

Then store the client (not as a Pages secret):

  npm run env:set -- CF_ACCESS_GOOGLE_CLIENT_ID '…'
  npm run env:set -- CF_ACCESS_GOOGLE_CLIENT_SECRET '…'
  npm run setup:ops-access
`);
}

try {
  loadDotEnv();
  const token = resolveCloudflareDevToken();
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
  if (!token || !accountId) {
    throw new Error(
      "CLOUDFLARE_DEV_API_TOKEN (or legacy CLOUDFLARE_API_TOKEN) and CLOUDFLARE_ACCOUNT_ID are required.",
    );
  }

  const clientId = process.env.CF_ACCESS_GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.CF_ACCESS_GOOGLE_CLIENT_SECRET?.trim();

  const org = await ensureOrganization(accountId, token);
  console.log(`Zero Trust team: ${org?.auth_domain || "(unknown)"}`);

  const googleIdp = await ensureGoogleIdp(accountId, token, {
    clientId,
    clientSecret,
  });
  if (googleIdp?.id) {
    console.log(`Google IdP: ${googleIdp.id}`);
  } else {
    console.log("Google IdP: not created yet (need CF_ACCESS_GOOGLE_CLIENT_ID/SECRET).");
    printGoogleSetup(org);
  }

  if (!googleIdp?.id) {
    process.exit(0);
  }

  const apps = await cfList(accountId, token, `/accounts/${accountId}/access/apps`);
  const googleIdpId = googleIdp.id;
  const production = await upsertApp(accountId, token, apps, {
    name: OPS_ACCESS_APP_NAME,
    domain: OPS_ACCESS_DOMAIN,
    googleIdpId,
  });
  const preview = await upsertApp(accountId, token, apps, {
    name: OPS_ACCESS_PREVIEW_APP_NAME,
    domain: OPS_ACCESS_PREVIEW_DOMAIN,
    googleIdpId,
  });

  await upsertAllowPolicy(accountId, token, production);
  await upsertAllowPolicy(accountId, token, preview);

  console.log(`
Done. Production: https://${OPS_ACCESS_DOMAIN}
Previews:         https://${OPS_ACCESS_PREVIEW_DOMAIN}
Google can sign in; only emails in the Baserow Users table (Active) may use ops.
Add or remove people there. Then: npm run setup:ops
`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
