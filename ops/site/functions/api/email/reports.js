import { jsonResponse, withApiHandler } from "../../../src/platform/http.js";
import { sentReports } from "../../../src/email/server/weekly-email.js";

/** Every email sent to the mailing list, with opens, clicks and unsubscribes. Anyone signed in; reads only. */
export const onRequestGet = withApiHandler(async (context) => {
  return jsonResponse({ ok: true, reports: await sentReports(context.env) });
});
