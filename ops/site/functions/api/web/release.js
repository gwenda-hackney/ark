import { jsonResponse, readJsonBody, withApiHandler } from "../../_lib/http.js";
import { requireAdmin } from "../../_lib/admin.js";
import { runsOnMachine } from "../../_lib/sanity.js";
import {
  getReleaseDiff,
  markReleasedInOps,
  publishRelease,
} from "../../_lib/release.js";

/** Staging vs production, published documents only. */
export const onRequestGet = withApiHandler(async (context) => {
  const diff = await getReleaseDiff(context.env);
  return jsonResponse({ ok: true, local: runsOnMachine(context.env), ...diff });
});

/**
 * Publish to production: `{ confirm: "production", ids?: string[] }`.
 * Reset staging from live: `{ confirm: "staging", direction: "to-staging" }`.
 * Without ids, everything that differs is copied. The site itself updates
 * once edits go quiet (site-pending.js), so several publishes share one build.
 */
export const onRequestPost = withApiHandler(async (context) => {
  const body = await readJsonBody(context.request);
  const direction = body?.direction === "to-staging" ? "to-staging" : "to-production";
  // Resetting the preview site from live is a developer tool.
  if (direction === "to-staging") await requireAdmin(context.env, context.request);
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
      // Chosen documents that already matched live count as published too.
      marked = await markReleasedInOps(context.env, [...(ids || result.inSync || []), ...result.written]);
    } catch (error) {
      warnings.push(
        `Published, but ops status did not update: ${error?.message || "unknown error"}.`,
      );
    }
  }
  const deploy = null;
  return jsonResponse(
    { ok: true, ...result, warnings, marked, deploy },
    deploy ? 202 : 200,
  );
});
