import { describeSettings } from "../../../../../shared/config.js";
import { requireAdmin } from "../../_lib/admin.js";
import { jsonResponse, withApiHandler } from "../../_lib/http.js";

/** Every setting, per environment, and where each value comes from. Admins only. */
export const onRequestGet = withApiHandler(async (context) => {
  await requireAdmin(context.env, context.request);
  return jsonResponse({ ok: true, ...(await describeSettings(context.env)) });
});
