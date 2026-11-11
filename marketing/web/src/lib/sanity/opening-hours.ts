import { fetchVenueDetails, type OpeningDay } from "./venue-details";

export type { OpeningDay };

/**
 * The venue's week (ops: Settings → Venue details), Monday first, or null
 * when there is none or it doesn't add up: then nothing about hours shows.
 * Read with the rest of the venue's details (./venue-details.ts), so a page
 * asking for the hours and the party facts makes one query.
 */
export async function fetchOpeningHours(): Promise<OpeningDay[] | null> {
  return (await fetchVenueDetails()).openingHours;
}
