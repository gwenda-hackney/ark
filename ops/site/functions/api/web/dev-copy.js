import { jsonResponse, readJsonBody, withApiHandler } from "../../../src/platform/http.js";
import { requireAdmin } from "../../../src/access/server/admin.js";
import { DEV_COPY_TARGETS, dispatchDevCopy } from "../../../src/website/server/site-deploy.js";

/**
 * POST { target, confirm: target } copies production over dev: "everything"
 * (website content and both databases), "content", "ops-data" or
 * "website-data". Production is only read; the copy runs as a GitHub Action.
 */
export const onRequestPost = withApiHandler(async (context) => {
  await requireAdmin(context.env, context.request);
  const body = await readJsonBody(context.request);
  const target = String(body?.target || "");
  if (!DEV_COPY_TARGETS.includes(target)) {
    return jsonResponse({ error: `target must be one of: ${DEV_COPY_TARGETS.join(", ")}.` }, 400);
  }
  if (body?.confirm !== target) {
    return jsonResponse({ error: `Send confirm: "${target}" to overwrite dev.` }, 400);
  }
  const run = await dispatchDevCopy(context.env, target);
  return jsonResponse({ ok: true, target, ...run }, 202);
});
