import { jsonResponse, readJsonBody, withApiHandler } from "../../_lib/http.js";
import { dispatchStagingContentDeploy } from "../../_lib/site-deploy.js";

/** Rebuild the staging site. Production changes only from Website > Staging → live. */
export const onRequestPost = withApiHandler(async (context) => {
  const body = await readJsonBody(context.request);
  if (body?.confirm === "production") {
    return jsonResponse(
      { error: "Production is published from Website > Staging → live." },
      400,
    );
  }
  if (body?.confirm !== "staging") {
    return jsonResponse({ error: 'Send confirm: "staging" to rebuild staging.' }, 400);
  }
  const payload = await dispatchStagingContentDeploy(context.env);
  return jsonResponse({ ok: true, kind: "staging-content", ...payload }, 202);
});
