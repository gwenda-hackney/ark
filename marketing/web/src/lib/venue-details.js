/**
 * The venue's details (#240): one Sanity document, `venueDetails`, kept by
 * ops alone (ops/site/src/venue/server/venue-website.js, whose contract test
 * runs this query and readVenueDetails on what ops writes). One query reads
 * all of it: the opening hours (opening-hours.js), the party facts
 * (party-facts.js) and the venue's gallery of photos (#291; which of them
 * show where is lib/photo-sources.ts and lib/photos.js). What is missing, or
 * doesn't add up, comes back null, or for the gallery empty.
 */
import { readWeek } from "./opening-hours.js";
import { readParties } from "./party-facts.js";

/**
 * A gallery photo comes as its Sanity asset's address and size (the asset's
 * metadata), with what ops says it shows (`alt`) and the menu board on home
 * it may be pinned up on (`menu`), in the gallery's order.
 */
export const VENUE_DETAILS_QUERY = `*[_id == "venueDetails"][0]{
  "openingHours": openingHours[]{ day, closed, opens, closes },
  parties{ standing, seated, included, replyWithin },
  "gallery": gallery[]{
    "url": asset->url,
    "width": asset->metadata.dimensions.width,
    "height": asset->metadata.dimensions.height,
    alt,
    menu,
    "added": asset->_createdAt,
    "lqip": asset->metadata.lqip,
    "color": asset->metadata.palette.dominant.background
  }
}`;

/**
 * @typedef {{
 *   url?: string | null, width?: number | null, height?: number | null,
 *   alt?: string | null, menu?: string | null, added?: string | null,
 *   lqip?: string | null, color?: string | null,
 * }} VenueGalleryEntry
 */

/**
 * @typedef {{
 *   openingHours: import("./opening-hours.js").OpeningDay[] | null,
 *   parties: import("./party-facts.js").PartyFacts | null,
 *   gallery: VenueGalleryEntry[],
 * }} VenueDetails
 */

/**
 * The document as the query returns it → the details the pages use. The
 * gallery's entries come as Sanity has them; lib/photo-sources.ts makes
 * photos of them.
 * @returns {VenueDetails}
 */
export function readVenueDetails(doc) {
  return {
    openingHours: readWeek(doc?.openingHours),
    parties: readParties(doc?.parties),
    gallery: Array.isArray(doc?.gallery)
      ? doc.gallery.filter((entry) => entry && typeof entry === "object")
      : [],
  };
}
