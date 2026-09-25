import { jsonResponse, readJsonBody, withApiHandler } from "../_lib/http.js";
import {
  OPS_CONFIG_KEYS,
  getConfigValues,
  getPourTargets,
  resetPourTargets,
  setConfigString,
  setPourTargets,
} from "../_lib/config-store.js";

export const onRequestGet = withApiHandler(async (context) => {
  const [pourTargets, values] = await Promise.all([
    getPourTargets(context.env),
    getConfigValues(context.env),
  ]);
  return jsonResponse({
    pourTargets,
    values,
    settings: {
      sanityProjectId: values["sanity.project_id"] || null,
      siteDeployWebhookUrl: values["site_deploy.webhook_url"] || null,
      googleOauthClientId: values["google.oauth_client_id"] || null,
      taskRoleSocial: values[OPS_CONFIG_KEYS.taskRoleSocial] || "",
      clickupEventsListId: values[OPS_CONFIG_KEYS.clickupEventsListId] || "",
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
  if (body.events && typeof body.events === "object") {
    if (body.events.socialEmail !== undefined) {
      await setConfigString(
        context.env,
        OPS_CONFIG_KEYS.taskRoleSocial,
        String(body.events.socialEmail || "").trim(),
      );
    }
    if (body.events.clickupListId !== undefined) {
      await setConfigString(
        context.env,
        OPS_CONFIG_KEYS.clickupEventsListId,
        String(body.events.clickupListId || "").trim(),
      );
    }
    const values = await getConfigValues(context.env);
    return jsonResponse({
      ok: true,
      settings: {
        taskRoleSocial: values[OPS_CONFIG_KEYS.taskRoleSocial] || "",
        clickupEventsListId: values[OPS_CONFIG_KEYS.clickupEventsListId] || "",
      },
    });
  }
  if (!body.pourTargets || typeof body.pourTargets !== "object") {
    return jsonResponse({ error: "Expected pourTargets." }, 400);
  }
  const pourTargets = await setPourTargets(context.env, body.pourTargets);
  return jsonResponse({ ok: true, pourTargets });
});
