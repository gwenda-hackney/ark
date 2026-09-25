import { jsonResponse, withApiHandler } from "../../_lib/http.js";
import { runsOnMachine } from "../../_lib/sanity.js";
import { siteStatus } from "../../_lib/site-pending.js";
import { siteUrls } from "../../_lib/site-urls.js";

/** Changes waiting for each site's next update, for the Website page and menu badge. */
export const onRequestGet = withApiHandler(async (context) => {
  const [production, preview] = await Promise.all([
    siteStatus(context.env, "production"),
    siteStatus(context.env, "preview"),
  ]);
  return jsonResponse({
    ok: true,
    local: runsOnMachine(context.env),
    urls: siteUrls(context.env),
    production,
    preview,
  });
});
