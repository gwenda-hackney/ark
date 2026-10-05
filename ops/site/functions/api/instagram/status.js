import { jsonResponse, withApiHandler } from "../../../src/platform/http.js";
import { instagramStatus } from "../../../src/instagram/server/instagram-services.js";

/** Is Instagram set up here, and which account do posts go to (#26). */
export const onRequestGet = withApiHandler(async (context) => {
  return jsonResponse(await instagramStatus(context.env));
});
