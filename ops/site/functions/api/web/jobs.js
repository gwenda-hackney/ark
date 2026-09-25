import { jsonResponse, readJsonBody, withApiHandler } from "../../_lib/http.js";
import { listWebsiteJobs, runWebsiteJob } from "../../_lib/website-jobs.js";

/** Saved events still being got ready for the website. */
export const onRequestGet = withApiHandler(async (context) => {
  return jsonResponse({ ok: true, jobs: await listWebsiteJobs(context.env) });
});

/** Run one step: for `eventId`, or the next waiting event. */
export const onRequestPost = withApiHandler(async (context) => {
  const body = (await readJsonBody(context.request).catch(() => null)) || {};
  const result = await runWebsiteJob(context.env, {
    eventId: String(body.eventId || "").trim(),
    retry: Boolean(body.retry),
  });
  return jsonResponse({ ok: true, ...result });
});
