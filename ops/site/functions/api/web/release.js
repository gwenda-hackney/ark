import { jsonResponse, readJsonBody, withApiHandler } from "../../_lib/http.js";
import { isLocalOps } from "../../_lib/sanity.js";
import {
  getReleaseDiff,
  markReleasedInOps,
  publishRelease,
} from "../../_lib/release.js";
import { dispatchProductionDeploy } from "../../_lib/site-deploy.js";

/** Staging vs production, published documents only. */
export const onRequestGet = withApiHandler(async (context) => {
  const diff = await getReleaseDiff(context.env);
  return jsonResponse({ ok: true, local: isLocalOps(context.env), ...diff });
});

/**
 * Publish to production: `{ confirm: "production", ids?: string[] }`.
 * Without ids, everything that differs goes live. Then production rebuilds.
 */
export const onRequestPost = withApiHandler(async (context) => {
  const body = await readJsonBody(context.request);
  if (body?.confirm !== "production") {
    return jsonResponse({ error: 'Send confirm: "production" to publish.' }, 400);
  }
  const ids = Array.isArray(body.ids)
    ? body.ids.map((id) => String(id || "").trim()).filter(Boolean)
    : null;
  if (ids && !ids.length) {
    return jsonResponse({ error: "Choose at least one change to publish." }, 400);
  }
  const result = await publishRelease(context.env, { ids });
  const warnings = [...result.warnings];
  let marked = { nights: 0, menuItems: 0 };
  try {
    marked = await markReleasedInOps(context.env, result.written);
  } catch (error) {
    warnings.push(
      `Published, but ops status did not update: ${error?.message || "unknown error"}.`,
    );
  }
  let deploy = null;
  if (result.written.length || result.deleted.length) {
    try {
      deploy = await dispatchProductionDeploy(context.env);
    } catch (error) {
      warnings.push(
        `Published, but the live site rebuild did not start: ${error?.message || "unknown error"}.`,
      );
    }
  }
  return jsonResponse(
    { ok: true, ...result, warnings, marked, deploy },
    deploy ? 202 : 200,
  );
});
