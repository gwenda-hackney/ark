import { assertNotLocal, isLocalOps } from "../../platform/sanity.js";

/** Which website a build is for: dev ops builds the dev site, never gwenda.co.uk. */
export function buildEnvironment(env) {
  return isLocalOps(env) ? "dev" : "prod";
}

/**
 * Site rebuilds go through the deploy webhook, which starts the GitHub
 * workflows: the preview from the drafts, the live site from what is published.
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

/** Rebuild the preview site: drafts over published. */
export async function dispatchPreviewDeploy(env) {
  assertNotLocal(env, "Local ops cannot rebuild the hosted sites.");
  const { baseUrl, secret } = webhookConfig(env);
  if (!baseUrl || !secret) {
    const error = new Error("Site deploy webhook is not configured on ops.");
    error.status = 503;
    throw error;
  }
  return webhookJson(`${baseUrl}/deploy`, secret, {
    method: "POST",
    body: { target: "preview", env: buildEnvironment(env) },
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

/** Rebuild the live site from the release branch and published documents. */
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
    body: { kind: "to-production", env: buildEnvironment(env) },
  });
}

/** Commits on the preview that live does not have, via the webhook's GitHub token. */
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

/** What a copy of production over dev can cover (copy-prod-to-dev.yml). */
export const DEV_COPY_TARGETS = ["everything", "content", "ops-data", "website-data"];

/** Start the copy-prod-to-dev workflow for one target. */
export async function dispatchDevCopy(env, target) {
  assertNotLocal(env, "Local ops cannot start a copy to dev.");
  // It reads production, so only production ops may ask (the webhook checks too).
  if (isLocalOps(env)) {
    const error = new Error("Copy production to dev from production ops: it reads production.");
    error.status = 403;
    throw error;
  }
  const { baseUrl, secret } = webhookConfig(env);
  if (!baseUrl || !secret) {
    const error = new Error("Site deploy webhook is not configured on ops.");
    error.status = 503;
    throw error;
  }
  return webhookJson(`${baseUrl}/dev-copy`, secret, {
    method: "POST",
    body: { target },
  });
}
