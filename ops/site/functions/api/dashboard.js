import { jsonResponse, withApiHandler } from "../../src/platform/http.js";
import { loggerFromContext } from "../../src/platform/log.js";
import { collectDashboard } from "../../src/home/server/dashboard.js";

/** Everything the dashboard shows except drinks and Sentry, one section each. */
export const onRequestGet = withApiHandler(async (context) => {
  const data = await collectDashboard(context.env, {}, { log: loggerFromContext(context) });
  return jsonResponse(data, 200, { "Cache-Control": "no-store" });
});
