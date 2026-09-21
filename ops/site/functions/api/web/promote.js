import { jsonResponse, readJsonBody, withApiHandler } from "../../_lib/http.js";
import { copyStagingSnapshotsToProduction } from "../../_lib/publish-sync.js";

function webhookConfig(env) {
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

export const onRequestPost = withApiHandler(async (context) => {
  const body = await readJsonBody(context.request);
  const confirm = body?.confirm;
  if (confirm !== "staging" && confirm !== "production") {
    return jsonResponse(
      {
        error:
          "Type confirm: staging (rebuild) or confirm: production (copy staging).",
      },
      400,
    );
  }
  const { baseUrl, secret } = webhookConfig(context.env);
  if (!baseUrl || !secret) {
    return jsonResponse(
      { error: "Site deploy webhook is not configured on ops." },
      503,
    );
  }
  const path = confirm === "staging" ? "/deploy" : "/promote";
  const payloadBody =
    confirm === "staging"
      ? { target: "staging" }
      : { kind: "staging-to-production" };
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payloadBody),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(
      payload.error || `Promote webhook failed (${response.status}).`,
    );
    error.status = response.status;
    throw error;
  }
  let snapshots = { copied: 0 };
  if (confirm === "production") {
    try {
      snapshots = await copyStagingSnapshotsToProduction(context.env);
    } catch (error) {
      snapshots = {
        copied: 0,
        error: error instanceof Error ? error.message : "Could not copy snapshots.",
      };
    }
  }
  const kind =
    confirm === "staging" ? "staging-content" : "staging-to-production";
  return jsonResponse({ ok: true, kind, snapshots, ...payload }, 202);
});
