import { jsonResponse, readJsonBody, withApiHandler } from "../../_lib/http.js";
import { siteEnvName } from "../../_lib/config-store.js";
import { deployTargetForEnv } from "../../_lib/menu.js";
import { syncOpsMenuToSanity } from "../../_lib/publish-sync.js";
import {
  dispatchStagingContentDeploy,
  webhookConfig,
  webhookJson,
} from "../../_lib/site-deploy.js";

export const onRequestPost = withApiHandler(async (context) => {
  const body = await readJsonBody(context.request);
  const target = deployTargetForEnv(
    body?.target || body?.env,
    siteEnvName(context.env),
  );
  if (target === "production") {
    return jsonResponse(
      { error: "Production is updated by promoting staging from Web." },
      400,
    );
  }
  const { baseUrl, secret } = webhookConfig(context.env);
  if (target !== "development" && (!baseUrl || !secret)) {
    return jsonResponse(
      { error: "Site deploy webhook is not configured on ops." },
      503,
    );
  }

  const action = body?.action === "promote" ? "promote" : "deploy";
  if (action === "promote") {
    return jsonResponse(
      { error: "Promote staging from the Web page, not from recipe publish." },
      400,
    );
  }

  const sync = await syncOpsMenuToSanity(context.env, { target: "staging" });
  const changed =
    (sync.synced?.length || 0) +
    (sync.created?.length || 0) +
    (sync.sectionWrites || 0);
  if (!changed || target === "development") {
    return jsonResponse({
      ok: true,
      target,
      dataset: "staging",
      sync,
      deployed: false,
    });
  }
  const result = await dispatchStagingContentDeploy(context.env);
  return jsonResponse(
    {
      ok: true,
      target,
      dataset: "staging",
      sync,
      deployed: true,
      ...result,
    },
    202,
  );
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
