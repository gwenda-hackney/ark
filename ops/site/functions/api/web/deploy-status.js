import { jsonResponse, withApiHandler } from "../../../src/platform/http.js";
import { fetchDeployStatus } from "../../../src/website/server/site-deploy.js";

export const onRequestGet = withApiHandler(async (context) => {
  const runId = new URL(context.request.url).searchParams.get("run_id");
  const status = await fetchDeployStatus(context.env, runId);
  return jsonResponse(status);
});
