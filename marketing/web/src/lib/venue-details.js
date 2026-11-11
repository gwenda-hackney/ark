/**
 * The venue's details (#240): one Sanity document, `venueDetails`, kept by
 * ops alone (ops/site/src/venue/server/venue-website.js, whose contract test
 * runs this query and readVenueDetails on what ops writes). One query reads
 * all of it: the opening hours (opening-hours.js) and the party facts
 * (party-facts.js). What is missing, or doesn't add up, comes back null.
 */
import { readWeek } from "./opening-hours.js";
import { readParties } from "./party-facts.js";

export const VENUE_DETAILS_QUERY = `*[_id == "venueDetails"][0]{
  "openingHours": openingHours[]{ day, closed, opens, closes },
  parties{ standing, seated, included, replyWithin }
}`;

/**
 * @typedef {{
 *   openingHours: import("./opening-hours.js").OpeningDay[] | null,
 *   parties: import("./party-facts.js").PartyFacts | null,
 * }} VenueDetails
 */

/**
 * The document as the query returns it → the details the pages use.
 * @returns {VenueDetails}
 */
export function readVenueDetails(doc) {
  return {
    openingHours: readWeek(doc?.openingHours),
    parties: readParties(doc?.parties),
  };
}
