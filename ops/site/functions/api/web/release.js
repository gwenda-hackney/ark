import { jsonResponse, readJsonBody, withApiHandler } from "../../../src/platform/http.js";
import { requireAdmin } from "../../../src/access/server/admin.js";
import { runsOnMachine } from "../../../src/platform/sanity.js";
import {
  getReleaseDiff,
  markDiscardedInOps,
  markReleasedInOps,
  publishRelease,
} from "../../../src/website/server/release.js";

/** The preview (drafts over published) vs what the website shows. */
export const onRequestGet = withApiHandler(async (context) => {
  const diff = await getReleaseDiff(context.env);
  return jsonResponse({ ok: true, local: runsOnMachine(context.env), ...diff });
});

/**
 * Publish drafts: `{ confirm: "production", ids?: string[] }`.
 * Discard drafts: `{ confirm: "preview", direction: "discard" }`.
 * Without ids, everything that differs. The site itself updates once edits
 * go quiet (site-pending.js), so several publishes share one build.
 */
export const onRequestPost = withApiHandler(async (context) => {
  const body = await readJsonBody(context.request);
  const direction = body?.direction === "discard" ? "discard" : "to-production";
  // Throwing away preview changes is a developer tool.
  if (direction === "discard") await requireAdmin(context.env, context.request);
  const expected = direction === "discard" ? "preview" : "production";
  if (body?.confirm !== expected) {
    return jsonResponse({ error: `Send confirm: "${expected}" to change the ${expected}.` }, 400);
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
      marked = await markReleasedInOps(context.env, [...(ids || result.inSync || []), ...result.written], {
        deleted: result.deleted,
      });
    } catch (error) {
      warnings.push(
        `Published, but ops status did not update: ${error?.message || "unknown error"}.`,
      );
    }
  }
  if (direction === "discard") {
    try {
      await markDiscardedInOps(context.env, result.discarded);
    } catch (error) {
      warnings.push(`Discarded, but ops status did not update: ${error?.message || "unknown error"}.`);
    }
  }
  const deploy = null;
  return jsonResponse(
    { ok: true, ...result, warnings, marked, deploy },
    deploy ? 202 : 200,
  );
});
