import { jsonResponse, readJsonBody, withApiHandler } from "../../../src/platform/http.js";
import { dispatchPreviewDeploy } from "../../../src/features/web/server/site-deploy.js";

/** Rebuild the preview site. The live site changes only when drafts are published. */
export const onRequestPost = withApiHandler(async (context) => {
  const body = await readJsonBody(context.request);
  if (body?.confirm === "production") {
    return jsonResponse(
      { error: "Production is published from Website > Preview → live." },
      400,
    );
  }
  if (body?.confirm !== "preview") {
    return jsonResponse({ error: 'Send confirm: "preview" to rebuild preview.' }, 400);
  }
  const payload = await dispatchPreviewDeploy(context.env);
  return jsonResponse({ ok: true, kind: "preview", ...payload }, 202);
});
