import { jsonResponse, withApiHandler } from "../../../src/platform/http.js";
import { requireAdmin } from "../../../src/features/access/server/admin.js";
import { compareCode } from "../../../src/features/web/server/site-deploy.js";
import { sanityQuery } from "../../../src/platform/sanity.js";
import { collectWebStatus } from "../../../src/features/web/server/web-status.js";

/**
 * Code on preview vs live. Commits come from each site's health endpoint;
 * the commit list from GitHub through the deploy webhook.
 */
export const onRequestGet = withApiHandler(async (context) => {
  await requireAdmin(context.env, context.request);
  const status = await collectWebStatus(context.env, { sanityQuery });
  const head = status.environments?.preview?.code?.commit || null;
  const base = status.environments?.production?.code?.commit || null;
  if (!head || !base) {
    return jsonResponse({ ok: true, preview: head, live: base, same: null, commits: [] });
  }
  if (head === base) {
    return jsonResponse({ ok: true, preview: head, live: base, same: true, commits: [] });
  }
  try {
    const diff = await compareCode(context.env, { base, head });
    return jsonResponse({ ok: true, preview: head, live: base, same: false, ...diff });
  } catch (error) {
    return jsonResponse({
      ok: true,
      preview: head,
      live: base,
      same: false,
      commits: [],
      error: error?.message || "Could not list the commits.",
    });
  }
});
