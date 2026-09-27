import { describeSettings } from "../../../../../shared/config.js";
import { requireAdmin } from "../../../src/access/server/admin.js";
import { jsonResponse, withApiHandler } from "../../../src/platform/http.js";

/** Every setting, per environment, and where each value comes from. Admins only. */
export const onRequestGet = withApiHandler(async (context) => {
  await requireAdmin(context.env, context.request);
  return jsonResponse({ ok: true, ...(await describeSettings(context.env)) });
});
