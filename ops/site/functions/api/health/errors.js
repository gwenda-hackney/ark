import { jsonResponse, withApiHandler } from "../../../src/platform/http.js";
import { sentryErrors } from "../../../src/website/server/sentry-errors.js";

/** Unresolved Sentry issues in the last 24 hours, cached for five minutes. */
export const onRequestGet = withApiHandler(async (context) => {
  return jsonResponse(await sentryErrors(context.env), 200, { "Cache-Control": "no-store" });
});
