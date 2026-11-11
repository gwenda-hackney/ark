import { getVenueDetails } from "../../../src/venue/server/venue-details.js";
import { jsonResponse, withApiHandler } from "../../../src/platform/http.js";

/** The venue's details (opening hours and party facts, #240), and where they stand on the website. */
export const onRequestGet = withApiHandler(async (context) => {
  return jsonResponse({ ok: true, ...(await getVenueDetails(context.env)) });
});
