import { jsonResponse, readJsonBody, withApiHandler } from "../_lib/http.js";
import {
  getConfigValues,
  getPourTargets,
  resetPourTargets,
  setPourTargets,
} from "../_lib/config-store.js";

export const onRequestGet = withApiHandler(async (context) => {
  const [pourTargets, values] = await Promise.all([
    getPourTargets(context.env),
    getConfigValues(context.env, { service: "ops" }),
  ]);
  return jsonResponse({
    pourTargets,
    values,
    settings: {
      sanityProjectId: values["sanity.project_id"] || null,
      sanityDataset: values["sanity.dataset"] || null,
      siteDeployWebhookUrl: values["site_deploy.webhook_url"] || null,
      googleOauthClientId: values["google.oauth_client_id"] || null,
    },
  });
});

export const onRequestPatch = withApiHandler(async (context) => {
  const body = await readJsonBody(context.request);
  if (!body || typeof body !== "object") {
    return jsonResponse({ error: "Invalid request." }, 400);
  }
  if (body.reset === true) {
    const pourTargets = await resetPourTargets(context.env);
    return jsonResponse({ ok: true, pourTargets });
  }
  if (!body.pourTargets || typeof body.pourTargets !== "object") {
    return jsonResponse({ error: "Expected pourTargets." }, 400);
  }
  const pourTargets = await setPourTargets(context.env, body.pourTargets);
  return jsonResponse({ ok: true, pourTargets });
});
