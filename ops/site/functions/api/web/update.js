import { jsonResponse, readJsonBody, withApiHandler } from "../../_lib/http.js";
import { assertNotLocal } from "../../_lib/sanity.js";
import { siteStatus, updateNow } from "../../_lib/site-pending.js";

/** "Update website now": build { site: "production" | "staging" } straight away. */
export const onRequestPost = withApiHandler(async (context) => {
  assertNotLocal(context.env, "Local ops cannot update the hosted sites.");
  const body = await readJsonBody(context.request).catch(() => null);
  const site = body?.site === "staging" ? "staging" : "production";
  await updateNow(context.env, site);
  return jsonResponse({ ok: true, status: await siteStatus(context.env, site) }, 202);
});
