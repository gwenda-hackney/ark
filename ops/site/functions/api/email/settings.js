import { jsonResponse, readJsonBody, withApiHandler } from "../../../src/platform/http.js";
import { saveSettings } from "../../../src/email/server/weekly-email.js";
import { requireEmailAdmin } from "../../../src/email/server/email-admin.js";

/** Change the schedule and mode: { sending?, mode?, day?, time?, notify? }. Admins only. */
export const onRequestPost = withApiHandler(async (context) => {
  await requireEmailAdmin(context);
  const body = (await readJsonBody(context.request)) || {};
  const { sending, mode, day, time, notify } = body;
  return jsonResponse({ ok: true, settings: await saveSettings(context.env, { sending, mode, day, time, notify }) });
});
