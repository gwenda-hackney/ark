import { jsonResponse, withApiHandler } from "../../_lib/http.js";
import { isLocalOps } from "../../_lib/sanity.js";
import { siteStatus } from "../../_lib/site-pending.js";

/** Changes waiting for each site's next update, for the Website page and menu badge. */
export const onRequestGet = withApiHandler(async (context) => {
  const [production, staging] = await Promise.all([
    siteStatus(context.env, "production"),
    siteStatus(context.env, "staging"),
  ]);
  return jsonResponse({ ok: true, local: isLocalOps(context.env), production, staging });
});
