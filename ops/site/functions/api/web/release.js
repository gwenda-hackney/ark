import { jsonResponse, readJsonBody, withApiHandler } from "../../_lib/http.js";
import { isLocalOps } from "../../_lib/sanity.js";
import {
  getReleaseDiff,
  markReleasedInOps,
  publishRelease,
} from "../../_lib/release.js";
import {
  dispatchProductionDeploy,
  dispatchStagingContentDeploy,
} from "../../_lib/site-deploy.js";

/** Staging vs production, published documents only. */
export const onRequestGet = withApiHandler(async (context) => {
  const diff = await getReleaseDiff(context.env);
  return jsonResponse({ ok: true, local: isLocalOps(context.env), ...diff });
});

/**
 * Publish to production: `{ confirm: "production", ids?: string[] }`.
 * Reset staging from live: `{ confirm: "staging", direction: "to-staging" }`.
 * Without ids, everything that differs is copied. Then the target rebuilds.
 */
export const onRequestPost = withApiHandler(async (context) => {
  const body = await readJsonBody(context.request);
  const direction = body?.direction === "to-staging" ? "to-staging" : "to-production";
  const expected = direction === "to-staging" ? "staging" : "production";
  if (body?.confirm !== expected) {
    return jsonResponse({ error: `Send confirm: "${expected}" to overwrite ${expected}.` }, 400);
  }
  const ids = Array.isArray(body.ids)
    ? body.ids.map((id) => String(id || "").trim()).filter(Boolean)
    : null;
  if (ids && !ids.length) {
    return jsonResponse({ error: "Choose at least one change to publish." }, 400);
  }
  const result = await publishRelease(context.env, { ids, direction });
  const warnings = [...result.warnings];
  let marked = { nights: 0, menuItems: 0 };
  if (direction === "to-production") {
    try {
      marked = await markReleasedInOps(context.env, result.written);
    } catch (error) {
      warnings.push(
        `Published, but ops status did not update: ${error?.message || "unknown error"}.`,
      );
    }
  }
  let deploy = null;
  if (result.written.length || result.deleted.length) {
    const rebuild =
      direction === "to-staging" ? dispatchStagingContentDeploy : dispatchProductionDeploy;
    try {
      deploy = await rebuild(context.env);
    } catch (error) {
      warnings.push(
        `Copied, but the ${direction === "to-staging" ? "staging" : "live"} site rebuild did not start: ${error?.message || "unknown error"}.`,
      );
    }
  }
  return jsonResponse(
    { ok: true, ...result, warnings, marked, deploy },
    deploy ? 202 : 200,
  );
});
