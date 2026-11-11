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

export type VenueDetails = {
  openingHours: OpeningDay[] | null;
  parties: PartyFacts | null;
};

const NONE: VenueDetails = { openingHours: null, parties: null };

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
 * The venue's details (ops: Settings → Venue details), one query for all
 * of them: the week, Monday first, and the party facts. Each is null when
 * there is none or it doesn't add up: then nothing about it shows. A build
 * asks once; `astro dev` asks on every page, so a change in ops shows on
 * the next reload.
 */
export function fetchVenueDetails(): Promise<VenueDetails> {
  if (import.meta.env.DEV) return load();
  built ??= load();
  return built;
}
