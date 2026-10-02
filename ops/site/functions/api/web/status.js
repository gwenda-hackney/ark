import { jsonResponse, withApiHandler } from "../../../src/platform/http.js";
import { sanityQuery } from "../../../src/platform/sanity.js";
import { collectWebStatus } from "../../../src/website/server/web-status.js";

export const onRequestGet = withApiHandler(async (context) => {
  const status = await collectWebStatus(context.env, { sanityQuery });
  return jsonResponse(status);
});
