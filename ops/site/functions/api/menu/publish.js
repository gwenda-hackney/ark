import { jsonResponse, readJsonBody, withApiHandler } from "../../_lib/http.js";
import { deployTargetForEnv } from "../../_lib/menu.js";
import { syncOpsMenuToSanity } from "../../_lib/publish-sync.js";

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

async function webhookJson(url, secret, { method = "GET", body } = {}) {
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

export const onRequestPost = withApiHandler(async (context) => {
  const body = await readJsonBody(context.request);
  const target = deployTargetForEnv(body?.target || body?.env || "staging");
  const { baseUrl, secret } = webhookConfig(context.env);
  if (!baseUrl || !secret) {
    return jsonResponse(
      { error: "Site deploy webhook is not configured on ops." },
      503,
    );
  }

  const action = body?.action === "promote" ? "promote" : "deploy";
  if (action === "promote") {
    const previewRunId = Number(body?.previewRunId);
    if (!Number.isFinite(previewRunId) || previewRunId <= 0) {
      return jsonResponse({ error: "previewRunId is required to promote." }, 400);
    }
    const result = await webhookJson(`${baseUrl}/promote`, secret, {
      method: "POST",
      body: { previewRunId },
    });
    return jsonResponse({ ok: true, ...result }, 202);
  }

  const sync = await syncOpsMenuToSanity(context.env, { target });
  const changed =
    (sync.synced?.length || 0) +
    (sync.created?.length || 0) +
    (sync.sectionWrites || 0);
  if (!changed) {
    return jsonResponse({ ok: true, target, sync, deployed: false });
  }
  const result = await webhookJson(`${baseUrl}/deploy`, secret, {
    method: "POST",
    body: { target },
  });
  return jsonResponse({ ok: true, target, sync, deployed: true, ...result }, 202);
});

export const onRequestGet = withApiHandler(async (context) => {
  const { baseUrl, secret } = webhookConfig(context.env);
  if (!baseUrl || !secret) {
    return jsonResponse(
      { error: "Site deploy webhook is not configured on ops." },
      503,
    );
  }
  const runId = new URL(context.request.url).searchParams.get("run_id");
  if (!runId) return jsonResponse({ error: "run_id is required." }, 400);
  const result = await webhookJson(
    `${baseUrl}/status?run_id=${encodeURIComponent(runId)}`,
    secret,
  );
  return jsonResponse(result);
});
