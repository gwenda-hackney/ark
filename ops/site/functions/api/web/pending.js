import { jsonResponse, withApiHandler } from "../../../src/platform/http.js";
import { runsOnMachine } from "../../../src/platform/sanity.js";
import { siteStatus } from "../../../src/features/web/server/site-pending.js";
import { siteUrls } from "../../../src/features/web/server/site-urls.js";

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
