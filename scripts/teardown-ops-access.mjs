#!/usr/bin/env node
/**
 * Delete Cloudflare Access apps/IdP created for gwenda-ops.
 *
 * Usage: npm run teardown:ops-access
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveCloudflareDevToken } from "./lib/cloudflare-tokens.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ENV_PATH = resolve(ROOT, ".env");

const APP_NAMES = ["Gwenda ops", "Gwenda ops previews"];
const APP_DOMAINS = ["gwenda-ops.pages.dev", "*.gwenda-ops.pages.dev"];
const IDP_NAME = "Google";

function loadDotEnv() {
  if (!existsSync(ENV_PATH)) return;
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
    const err = new Error(msg);
    err.status = res.status;
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

function matchesApp(app) {
  if (APP_NAMES.includes(app?.name)) return true;
  if (APP_DOMAINS.includes(app?.domain)) return true;
  const hosted = app?.self_hosted_domains;
  if (Array.isArray(hosted) && hosted.some((d) => APP_DOMAINS.includes(d))) {
    return true;
  }
  const destinations = app?.destinations;
  if (
    Array.isArray(destinations) &&
    destinations.some((d) => APP_DOMAINS.includes(d?.uri))
  ) {
    return true;
  }
  return false;
}

try {
  loadDotEnv();
  const token = resolveCloudflareDevToken();
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
  if (!token || !accountId) {
    throw new Error(
      "CLOUDFLARE_DEV_API_TOKEN (or CLOUDFLARE_API_TOKEN) and CLOUDFLARE_ACCOUNT_ID are required.",
    );
  }

  const apps = await cfList(accountId, token, `/accounts/${accountId}/access/apps`);
  const targets = apps.filter(matchesApp);
  if (!targets.length) {
    console.log("No Gwenda ops Access apps found.");
  }
  for (const app of targets) {
    await cf(accountId, token, `/accounts/${accountId}/access/apps/${app.id}`, {
      method: "DELETE",
    });
    console.log(`Deleted Access app "${app.name}" (${app.domain || app.id}).`);
  }

  const idps = await cfList(
    accountId,
    token,
    `/accounts/${accountId}/access/identity_providers`,
  );
  const googleIdp =
    idps.find((idp) => idp?.name === IDP_NAME && idp?.type === "google") ||
    idps.find((idp) => idp?.type === "google") ||
    null;
  if (googleIdp?.id) {
    await cf(
      accountId,
      token,
      `/accounts/${accountId}/access/identity_providers/${googleIdp.id}`,
      { method: "DELETE" },
    );
    console.log(`Deleted Google identity provider (${googleIdp.id}).`);
  } else {
    console.log("No Google Access IdP found.");
  }

  console.log(`
Done. Ops auth is app-owned Google OAuth now.
Zero Trust org left in place (harmless if unused).
`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
