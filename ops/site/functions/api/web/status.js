import { jsonResponse, withApiHandler } from "../../_lib/http.js";
import { sanityQuery } from "../../_lib/sanity.js";
import { collectWebStatus } from "../../_lib/web-status.js";

export const onRequestGet = withApiHandler(async (context) => {
  const status = await collectWebStatus(context.env, { sanityQuery });
  return jsonResponse(status);
});
