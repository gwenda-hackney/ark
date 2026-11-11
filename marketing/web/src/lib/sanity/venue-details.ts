import { VENUE_DETAILS_QUERY, readVenueDetails } from "../venue-details.js";
import { createSanityClient } from "./client";

export type OpeningDay = {
  day: string;
  closed: boolean;
  opens: string;
  closes: string;
};

export type PartyFacts = {
  standing: number | null;
  seated: number | null;
  included: string[];
  replyWithin: string;
};

/**
 * A photo of the venue's gallery as Sanity has it (VENUE_DETAILS_QUERY):
 * lib/photo-sources.ts makes the site's photos of these.
 */
export type VenueGalleryEntry = {
  url?: string | null;
  width?: number | null;
  height?: number | null;
  alt?: string | null;
  menu?: string | null;
  added?: string | null;
  lqip?: string | null;
  color?: string | null;
};

export type VenueDetails = {
  openingHours: OpeningDay[] | null;
  parties: PartyFacts | null;
  /** The venue's own photos (ops: Gallery), in their order; empty when none. */
  gallery: VenueGalleryEntry[];
};

const NONE: VenueDetails = { openingHours: null, parties: null, gallery: [] };

let built: Promise<VenueDetails> | null = null;

async function load(): Promise<VenueDetails> {
  try {
    return readVenueDetails(
      await createSanityClient().fetch(VENUE_DETAILS_QUERY),
    ) as VenueDetails;
  } catch (error) {
    // Nothing is better than a broken build: the pages then say none.
    console.warn(
      `Venue details not loaded: ${error instanceof Error ? error.message : error}`,
    );
    return NONE;
  }
}

/**
 * The venue's details (ops: Settings → Venue details, and Gallery), one
 * query for all of them: the week, Monday first, the party facts, and the
 * venue's photos. Each is null (the photos: empty) when there is none or it
 * doesn't add up: then nothing about it shows. A build
 * asks once; `astro dev` asks on every page, so a change in ops shows on
 * the next reload.
 */
export function fetchVenueDetails(): Promise<VenueDetails> {
  if (import.meta.env.DEV) return load();
  built ??= load();
  return built;
}
