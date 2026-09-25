import { assertNotLocal } from "./sanity.js";

/**
 * Shared preview-site rebuild. Feature publishers write Sanity, then call this.
 * Production is not a full-dataset clone. A feature copies its own documents.
 */

export function webhookConfig(env) {
  const baseUrl = (
    env.SITE_DEPLOY_WEBHOOK_URL ||
    env.SANITY_STUDIO_SITE_DEPLOY_URL ||
    ""
  ).trim();
  const secret = (
    env.DEPLOY_WEBHOOK_SECRET ||
    env.SANITY_STUDIO_SITE_DEPLOY_SECRET ||
    ""
  ).trim();
  return { baseUrl: baseUrl.replace(/\/$/, ""), secret };
}

export async function webhookJson(url, secret, { method = "GET", body } = {}) {
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${secret}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || `Deploy webhook failed (${response.status}).`);
    error.status = response.status;
    throw error;
  }
  return payload;
}

/** Rebuild the preview site from the staging dataset. */
export async function dispatchStagingContentDeploy(env) {
  assertNotLocal(env, "Local ops cannot rebuild the hosted sites.");
  const { baseUrl, secret } = webhookConfig(env);
  if (!baseUrl || !secret) {
    const error = new Error("Site deploy webhook is not configured on ops.");
    error.status = 503;
    throw error;
  }
  return webhookJson(`${baseUrl}/deploy`, secret, {
    method: "POST",
    body: { target: "staging" },
  });
}

/** GitHub Actions status for a site publish started by the deploy webhook. */
export async function fetchDeployStatus(env, runId) {
  const id = Number(runId);
  if (!Number.isFinite(id) || id <= 0) {
    const error = new Error("Missing deploy run.");
    error.status = 400;
    throw error;
  }
  const { baseUrl, secret } = webhookConfig(env);
  if (!baseUrl || !secret) {
    const error = new Error("Site deploy webhook is not configured on ops.");
    error.status = 503;
    throw error;
  }
  return webhookJson(`${baseUrl}/status?run_id=${encodeURIComponent(String(id))}`, secret);
}

/**
 * Rebuild production from the release branch. Content is already copied
 * document by document by the Release page; this workflow no longer clones.
 */
export async function dispatchProductionDeploy(env) {
  assertNotLocal(env);
  const { baseUrl, secret } = webhookConfig(env);
  if (!baseUrl || !secret) {
    const error = new Error("Site deploy webhook is not configured on ops.");
    error.status = 503;
    throw error;
  }
  return webhookJson(`${baseUrl}/promote`, secret, {
    method: "POST",
    body: { kind: "staging-to-production" },
  });
}

/** Commits on staging that live does not have, via the webhook's GitHub token. */
export async function compareCode(env, { base, head }) {
  const { baseUrl, secret } = webhookConfig(env);
  if (!baseUrl || !secret) {
    const error = new Error("Site deploy webhook is not configured on ops.");
    error.status = 503;
    throw error;
  }
  const query = new URLSearchParams({ base, head });
  return webhookJson(`${baseUrl}/compare?${query}`, secret);
}

/** Start the Baserow copy workflow: production → ops-dev or website-staging. */
export async function dispatchBaserowCopy(env, target) {
  assertNotLocal(env, "Local ops cannot start a database copy.");
  const { baseUrl, secret } = webhookConfig(env);
  if (!baseUrl || !secret) {
    const error = new Error("Site deploy webhook is not configured on ops.");
    error.status = 503;
    throw error;
  }
  return webhookJson(`${baseUrl}/baserow-copy`, secret, {
    method: "POST",
    body: { target },
  });
}
