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
