import { jsonResponse, readJsonBody, withApiHandler } from "../../../src/platform/http.js";
import { siteEnvName } from "../../../src/platform/config-store.js";
import { deployTargetForEnv } from "../../../src/features/menu/server/menu.js";
import { syncOpsMenuToSanity } from "../../../src/features/web/server/publish-sync.js";
import {
  webhookConfig,
  webhookJson,
} from "../../../src/features/web/server/site-deploy.js";

export const onRequestPost = withApiHandler(async (context) => {
  const body = await readJsonBody(context.request);
  const target = deployTargetForEnv(
    body?.target || body?.env,
    siteEnvName(context.env),
  );
  if (target === "production") {
    return jsonResponse(
      { error: "Production is published from Website > Preview → live." },
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
      { error: "Publish to production from Website > Preview → live." },
      400,
    );
  }

  const sync = await syncOpsMenuToSanity(context.env, { target: "preview" });
  // The preview site updates on its own once edits go quiet (site-pending.js).
  return jsonResponse({
    ok: true,
    target,
    dataset: "preview",
    sync,
    deployed: false,
  });
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
