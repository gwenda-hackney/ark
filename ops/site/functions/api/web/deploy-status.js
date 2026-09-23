import { jsonResponse, withApiHandler } from "../../_lib/http.js";
import { fetchDeployStatus } from "../../_lib/site-deploy.js";

export const onRequestGet = withApiHandler(async (context) => {
  const runId = new URL(context.request.url).searchParams.get("run_id");
  const status = await fetchDeployStatus(context.env, runId);
  return jsonResponse(status);
});
